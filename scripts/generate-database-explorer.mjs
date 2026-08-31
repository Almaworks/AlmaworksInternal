import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function readArgument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function cleanInline(value) {
  return value.replaceAll("`", "").trim();
}

function classifyTable(name, domain) {
  if (/visa|agent/i.test(domain)) return "external";
  if (/legacy/i.test(domain) || ["availability", "mentors", "outreach", "outreach_activity_log", "startups"].includes(name)) return "legacy";
  if (["sessions", "mentor_assignment_requests", "mentor_assignment_audit"].includes(name)) return "bridge";
  return "current";
}

function parseDatabaseMap(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  let domain = "Other";
  let current = null;

  for (const line of lines) {
    const domainMatch = line.match(/^## (?:\d+\.\s*)?(.+)$/);
    if (domainMatch) {
      domain = cleanInline(domainMatch[1]);
      continue;
    }

    const tableMatch = line.match(/^### `([^`]+)`$/);
    if (tableMatch) {
      current = {
        name: tableMatch[1],
        domain,
        purpose: "",
        status: classifyTable(tableMatch[1], domain),
        columns: [],
        connections: [],
      };
      tables.push(current);
      continue;
    }

    if (!current) continue;
    const columnMatch = line.match(/^- `([^`]+)`(?: \(([^)]*)\))? — (.+)$/);
    if (columnMatch) {
      const description = columnMatch[3].trim();
      const targets = [...description.matchAll(/-> `([^`]+)`/g)].map((match) => match[1].split(".")[0]);
      current.columns.push({
        name: columnMatch[1],
        type: cleanInline(columnMatch[2] ?? ""),
        description: description.replaceAll("->", "connects to"),
        targets,
        primaryKey: /(?:^|,\s*)PK(?:,|$)/.test(cleanInline(columnMatch[2] ?? "")),
      });
      current.connections.push(...targets);
      continue;
    }

    if (!current.purpose && line.trim() && !line.startsWith("#") && !line.startsWith("- ")) {
      current.purpose = cleanInline(line);
    }
  }

  for (const table of tables) {
    table.connections = [...new Set(table.connections)].filter((target) => target !== table.name);
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      tables: tables.length,
      columns: tables.reduce((total, table) => total + table.columns.length, 0),
    },
    tables,
  };
}

function safeJson(data) {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

function renderArtifact(schema) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Almaworks · Database Explorer</title>
  <style>
    :root {
      --ink: #14221b;
      --ink-soft: #526158;
      --paper: #f4f2ec;
      --panel: #fffef9;
      --line: #dcd9cf;
      --line-strong: #bdb9ad;
      --forest: #18352a;
      --forest-2: #24483a;
      --lime: #cfe58a;
      --orange: #d56a3f;
      --blue: #4069c8;
      --purple: #7e62a8;
      --shadow: 0 22px 55px rgba(31, 42, 35, .09);
      --radius: 18px;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--paper); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    button, input { font: inherit; }
    button { color: inherit; }
    button:focus-visible, input:focus-visible { outline: 3px solid rgba(207, 229, 138, .85); outline-offset: 2px; }

    .shell { display: grid; grid-template-columns: 304px minmax(0, 1fr); min-height: 100vh; }
    .sidebar { position: sticky; top: 0; height: 100vh; overflow: hidden; display: flex; flex-direction: column; background: var(--forest); color: #f7f5ed; border-right: 1px solid rgba(255,255,255,.08); }
    .brand { padding: 28px 24px 20px; border-bottom: 1px solid rgba(255,255,255,.1); }
    .eyebrow { margin: 0 0 8px; color: var(--lime); font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
    .brand h1 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 26px; font-weight: 500; letter-spacing: -.02em; }
    .brand p { margin: 9px 0 0; color: rgba(255,255,255,.62); font-size: 12px; line-height: 1.5; }
    .sidebar-tools { padding: 16px 16px 10px; }
    .search-label { display: block; margin: 0 8px 7px; color: rgba(255,255,255,.58); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; }
    .search { width: 100%; border: 1px solid rgba(255,255,255,.15); border-radius: 12px; background: rgba(255,255,255,.08); color: white; padding: 11px 12px; }
    .search::placeholder { color: rgba(255,255,255,.42); }
    .scope-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 10px; }
    .scope-button { border: 1px solid rgba(255,255,255,.12); border-radius: 9px; background: transparent; color: rgba(255,255,255,.65); padding: 7px 4px; font-size: 10px; font-weight: 700; cursor: pointer; }
    .scope-button.active { background: var(--lime); border-color: var(--lime); color: var(--forest); }
    .nav-scroll { overflow: auto; padding: 4px 12px 24px; scrollbar-width: thin; }
    .nav-heading { display: flex; align-items: center; justify-content: space-between; margin: 14px 8px 7px; color: rgba(255,255,255,.46); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .12em; }
    .domain-button, .table-button { width: 100%; border: 0; text-align: left; cursor: pointer; }
    .domain-button { display: flex; justify-content: space-between; gap: 12px; border-radius: 10px; background: transparent; color: rgba(255,255,255,.72); padding: 9px 10px; font-size: 12px; }
    .domain-button:hover, .domain-button.active { background: rgba(255,255,255,.08); color: white; }
    .domain-count { color: rgba(255,255,255,.38); font-variant-numeric: tabular-nums; }
    .table-button { position: relative; border-radius: 10px; background: transparent; color: rgba(255,255,255,.67); padding: 9px 10px 9px 25px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
    .table-button::before { content: ""; position: absolute; left: 10px; top: 14px; width: 6px; height: 6px; border-radius: 50%; background: var(--status-color, #829187); }
    .table-button:hover { background: rgba(255,255,255,.06); color: white; }
    .table-button.active { background: white; color: var(--forest); }
    .table-button[data-status="legacy"] { --status-color: var(--orange); }
    .table-button[data-status="external"] { --status-color: var(--purple); }
    .table-button[data-status="bridge"] { --status-color: var(--blue); }

    .main { min-width: 0; padding: 38px clamp(22px, 4vw, 64px) 72px; }
    .topbar { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 30px; }
    .topbar h2 { margin: 0; max-width: 760px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(34px, 5vw, 60px); font-weight: 500; line-height: .98; letter-spacing: -.045em; }
    .topbar-copy { margin: 15px 0 0; max-width: 650px; color: var(--ink-soft); font-size: 15px; line-height: 1.6; }
    .overview-button { flex: 0 0 auto; border: 1px solid var(--line-strong); border-radius: 999px; background: transparent; padding: 10px 15px; font-weight: 750; cursor: pointer; }
    .overview-button:hover { background: var(--panel); }

    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 28px; }
    .metric { border-top: 1px solid var(--line-strong); padding: 14px 4px 0; }
    .metric strong { display: block; font-family: Georgia, "Times New Roman", serif; font-size: 30px; font-weight: 500; }
    .metric span { color: var(--ink-soft); font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .08em; }

    .section-kicker { margin: 0 0 9px; color: var(--orange); font-size: 11px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
    .section-title { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 29px; font-weight: 500; letter-spacing: -.025em; }
    .overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
    .domain-card { min-height: 175px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: 20px; text-align: left; cursor: pointer; box-shadow: 0 1px 0 rgba(255,255,255,.8) inset; transition: transform .18s ease, box-shadow .18s ease; }
    .domain-card:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
    .domain-card-index { display: flex; justify-content: space-between; color: var(--ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .domain-card h3 { margin: 25px 0 8px; max-width: 270px; font-family: Georgia, "Times New Roman", serif; font-size: 22px; font-weight: 500; line-height: 1.08; }
    .domain-card p { margin: 0; color: var(--ink-soft); font-size: 12px; line-height: 1.5; }
    .domain-card-bar { height: 4px; margin-top: 18px; border-radius: 4px; background: var(--line); overflow: hidden; }
    .domain-card-bar span { display: block; height: 100%; border-radius: inherit; background: var(--forest-2); }

    .signals { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px; margin: 32px 0; }
    .signal { border-radius: 14px; background: #e9e5da; padding: 18px; }
    .signal:first-child { background: var(--forest); color: white; }
    .signal-label { color: var(--orange); font-size: 10px; font-weight: 850; text-transform: uppercase; letter-spacing: .11em; }
    .signal:first-child .signal-label { color: var(--lime); }
    .signal strong { display: block; margin-top: 9px; font-family: Georgia, "Times New Roman", serif; font-size: 19px; font-weight: 500; }
    .signal p { margin: 7px 0 0; color: var(--ink-soft); font-size: 12px; line-height: 1.45; }
    .signal:first-child p { color: rgba(255,255,255,.64); }

    .table-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
    .breadcrumb { margin-bottom: 9px; color: var(--ink-soft); font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .table-header h3 { margin: 0; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: clamp(25px, 4vw, 42px); letter-spacing: -.04em; overflow-wrap: anywhere; }
    .table-purpose { margin: 13px 0 0; max-width: 720px; color: var(--ink-soft); line-height: 1.6; }
    .badges { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 16px; }
    .badge { border: 1px solid var(--line); border-radius: 999px; background: var(--panel); padding: 6px 9px; color: var(--ink-soft); font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
    .badge.status-legacy { border-color: #e3a288; color: #9b3f20; background: #fff2ec; }
    .badge.status-external { border-color: #c8b5dc; color: #634487; background: #f6effd; }
    .badge.status-bridge { border-color: #a9bbe9; color: #31539d; background: #eef3ff; }

    .map-panel, .columns-panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); box-shadow: 0 1px 0 rgba(255,255,255,.8) inset; }
    .map-panel { padding: 22px; margin-bottom: 14px; }
    .panel-heading { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; margin-bottom: 18px; }
    .panel-heading h4 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 21px; font-weight: 500; }
    .panel-heading span { color: var(--ink-soft); font-size: 11px; }
    .relationship-map { display: grid; grid-template-columns: minmax(0,1fr) 86px minmax(220px, .85fr) 86px minmax(0,1fr); align-items: center; gap: 9px; min-height: 210px; }
    .node-stack { display: grid; gap: 7px; }
    .node-label { margin-bottom: 3px; color: var(--ink-soft); font-size: 9px; font-weight: 850; text-transform: uppercase; letter-spacing: .12em; }
    .graph-node { width: 100%; border: 1px solid var(--line); border-radius: 11px; background: #f7f5ef; padding: 10px 11px; text-align: left; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; cursor: pointer; overflow-wrap: anywhere; }
    .graph-node:hover { border-color: var(--forest-2); background: white; }
    .graph-node.center { border: 0; background: var(--forest); color: white; padding: 20px 16px; text-align: center; font-size: 13px; box-shadow: 0 14px 30px rgba(24,53,42,.18); }
    .arrow-lane { position: relative; height: 1px; background: var(--line-strong); }
    .arrow-lane::after { content: ""; position: absolute; right: -1px; top: -4px; border-left: 7px solid var(--line-strong); border-top: 4px solid transparent; border-bottom: 4px solid transparent; }
    .empty-node { color: var(--ink-soft); font-size: 12px; font-style: italic; }

    .columns-panel { overflow: hidden; }
    .columns-head { display: grid; grid-template-columns: minmax(130px,.8fr) minmax(110px,.55fr) minmax(250px,2fr); gap: 16px; border-bottom: 1px solid var(--line); background: #ebe8df; padding: 11px 18px; color: var(--ink-soft); font-size: 9px; font-weight: 850; letter-spacing: .1em; text-transform: uppercase; }
    .column-row { display: grid; grid-template-columns: minmax(130px,.8fr) minmax(110px,.55fr) minmax(250px,2fr); gap: 16px; padding: 13px 18px; border-bottom: 1px solid var(--line); align-items: start; }
    .column-row:last-child { border-bottom: 0; }
    .column-name { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; font-weight: 750; overflow-wrap: anywhere; }
    .key-mark { display: inline-block; margin-left: 6px; border-radius: 4px; background: var(--lime); color: var(--forest); padding: 2px 4px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 8px; font-weight: 900; vertical-align: 1px; }
    .column-type { color: var(--blue); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; }
    .column-description { color: var(--ink-soft); font-size: 12px; line-height: 1.45; }
    .empty-state { border: 1px dashed var(--line-strong); border-radius: var(--radius); padding: 46px; text-align: center; color: var(--ink-soft); }

    @media (max-width: 1050px) {
      .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .signals { grid-template-columns: 1fr 1fr; }
      .signals .signal:first-child { grid-column: 1 / -1; }
      .relationship-map { grid-template-columns: 1fr 42px minmax(170px,.8fr) 42px 1fr; }
    }
    @media (max-width: 780px) {
      .shell { display: block; }
      .sidebar { position: relative; height: auto; max-height: 520px; }
      .brand { padding: 20px; }
      .main { padding: 26px 16px 50px; }
      .topbar { display: block; }
      .overview-button { margin-top: 18px; }
      .metrics { grid-template-columns: repeat(2, 1fr); }
      .overview-grid, .signals { grid-template-columns: 1fr; }
      .signals .signal:first-child { grid-column: auto; }
      .relationship-map { grid-template-columns: 1fr; gap: 12px; }
      .arrow-lane { width: 1px; height: 24px; margin: 0 auto; }
      .arrow-lane::after { right: -4px; top: auto; bottom: -1px; border: 0; border-top: 7px solid var(--line-strong); border-left: 4px solid transparent; border-right: 4px solid transparent; }
      .node-stack { grid-template-columns: repeat(2, minmax(0,1fr)); }
      .node-label { grid-column: 1 / -1; }
      .columns-head { display: none; }
      .column-row { grid-template-columns: 1fr; gap: 5px; padding: 15px; }
    }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } .domain-card { transition: none; } }
  </style>
</head>
<body>
  <div id="database-explorer" class="shell">
    <aside class="sidebar" aria-label="Database navigation">
      <div class="brand">
        <p class="eyebrow">Almaworks internal</p>
        <h1>Database explorer</h1>
        <p>Trace how identity, cohorts, sessions, and outreach data fit together.</p>
      </div>
      <div class="sidebar-tools">
        <label class="search-label" for="schema-search">Find a table or column</label>
        <input id="schema-search" class="search" type="search" placeholder="Try “mentor” or “semester_id”" autocomplete="off">
        <div class="scope-row" role="group" aria-label="Table scope">
          <button class="scope-button active" type="button" data-scope="all">All</button>
          <button class="scope-button" type="button" data-scope="legacy">Legacy</button>
          <button class="scope-button" type="button" data-scope="external">Separate</button>
        </div>
      </div>
      <div id="schema-nav" class="nav-scroll"></div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div>
          <p class="eyebrow">A working map, not a data dump</p>
          <h2>See the system behind the tables.</h2>
          <p class="topbar-copy">Choose a domain for context or a table to inspect its fields, dependencies, and downstream consumers.</p>
        </div>
        <button id="show-overview" class="overview-button" type="button">System overview</button>
      </header>
      <section class="metrics" aria-label="Schema summary">
        <div class="metric"><strong id="metric-tables"></strong><span>Public tables</span></div>
        <div class="metric"><strong id="metric-columns"></strong><span>Documented columns</span></div>
        <div class="metric"><strong id="metric-domains"></strong><span>Data domains</span></div>
        <div class="metric"><strong>100%</strong><span>RLS coverage</span></div>
      </section>
      <div id="explorer-content" aria-live="polite"></div>
    </main>
  </div>
  <script type="application/json" id="schema-data">${safeJson(schema)}</script>
  <script>
    (function () {
      "use strict";
      var schema = JSON.parse(document.getElementById("schema-data").textContent);
      var tableByName = new Map(schema.tables.map(function (table) { return [table.name, table]; }));
      var domains = Array.from(new Set(schema.tables.map(function (table) { return table.domain; })));
      var state = { domain: "all", scope: "all", search: "", selected: null };
      var nav = document.getElementById("schema-nav");
      var content = document.getElementById("explorer-content");
      var search = document.getElementById("schema-search");

      document.getElementById("metric-tables").textContent = schema.totals.tables;
      document.getElementById("metric-columns").textContent = schema.totals.columns;
      document.getElementById("metric-domains").textContent = domains.length;

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
        });
      }

      function matchesScope(table) {
        if (state.scope === "all") return true;
        return table.status === state.scope;
      }

      function matchesSearch(table) {
        if (!state.search) return true;
        var haystack = [table.name, table.domain, table.purpose]
          .concat(table.columns.map(function (column) { return column.name + " " + column.description; }))
          .join(" ").toLowerCase();
        return haystack.includes(state.search);
      }

      function visibleTables() {
        return schema.tables.filter(function (table) {
          return matchesScope(table) && matchesSearch(table) && (state.domain === "all" || table.domain === state.domain);
        });
      }

      function renderNav() {
        var visible = visibleTables();
        var domainRows = ['<div class="nav-heading"><span>Domains</span><span>' + domains.length + '</span></div>'];
        domainRows.push('<button class="domain-button ' + (state.domain === "all" ? "active" : "") + '" type="button" data-domain="all"><span>All domains</span><span class="domain-count">' + schema.tables.filter(matchesScope).filter(matchesSearch).length + '</span></button>');
        domains.forEach(function (domain) {
          var count = schema.tables.filter(function (table) { return table.domain === domain && matchesScope(table) && matchesSearch(table); }).length;
          domainRows.push('<button class="domain-button ' + (state.domain === domain ? "active" : "") + '" type="button" data-domain="' + escapeHtml(domain) + '"><span>' + escapeHtml(domain) + '</span><span class="domain-count">' + count + '</span></button>');
        });
        domainRows.push('<div class="nav-heading"><span>Tables</span><span>' + visible.length + '</span></div>');
        if (!visible.length) domainRows.push('<div class="table-button">No matches</div>');
        visible.forEach(function (table) {
          domainRows.push('<button class="table-button ' + (state.selected === table.name ? "active" : "") + '" type="button" data-table="' + escapeHtml(table.name) + '" data-status="' + table.status + '">' + escapeHtml(table.name) + '</button>');
        });
        nav.innerHTML = domainRows.join("");
      }

      function renderOverview() {
        var maxTables = Math.max.apply(null, domains.map(function (domain) { return schema.tables.filter(function (table) { return table.domain === domain; }).length; }));
        var cards = domains.map(function (domain, index) {
          var tables = schema.tables.filter(function (table) { return table.domain === domain; });
          var columns = tables.reduce(function (sum, table) { return sum + table.columns.length; }, 0);
          return '<button type="button" class="domain-card" data-domain="' + escapeHtml(domain) + '">' +
            '<div class="domain-card-index"><span>0' + (index + 1) + '</span><span>' + tables.length + ' tables</span></div>' +
            '<h3>' + escapeHtml(domain) + '</h3>' +
            '<p>' + columns + ' columns · ' + tables.filter(function (table) { return table.status === "legacy"; }).length + ' legacy tables</p>' +
            '<div class="domain-card-bar"><span style="width:' + Math.round((tables.length / maxTables) * 100) + '%"></span></div>' +
          '</button>';
        }).join("");
        content.innerHTML =
          '<section><p class="section-kicker">System landscape</p><h3 class="section-title">Seven domains, one shared schema</h3><div class="overview-grid">' + cards + '</div></section>' +
          '<section class="signals" aria-label="Structural findings">' +
            '<article class="signal"><span class="signal-label">Primary finding</span><strong>Two generations of the data model coexist.</strong><p>Current cohort-aware records sit beside legacy mentor, startup, session, and outreach structures.</p></article>' +
            '<article class="signal"><span class="signal-label">Dependency seam</span><strong>Sessions bridge old and new.</strong><p>Assignment records are current, while the resulting session still points to legacy mentors and startups.</p></article>' +
            '<article class="signal"><span class="signal-label">Boundary</span><strong>Visa data is a separate product.</strong><p>Seven agent and visa tables share the schema without joining to Almaworks cohorts.</p></article>' +
          '</section>';
      }

      function neighborButton(name, direction) {
        var table = tableByName.get(name);
        if (!table) return '<div class="graph-node">' + escapeHtml(name) + '<br><small>External schema</small></div>';
        return '<button type="button" class="graph-node" data-table="' + escapeHtml(name) + '" aria-label="Inspect ' + escapeHtml(name) + ', ' + direction + '">' + escapeHtml(name) + '</button>';
      }

      function renderTable(table) {
        var inbound = schema.tables.filter(function (candidate) { return candidate.connections.includes(table.name); }).map(function (candidate) { return candidate.name; });
        var outbound = table.connections;
        var inboundHtml = inbound.length ? inbound.map(function (name) { return neighborButton(name, "upstream"); }).join("") : '<span class="empty-node">No public tables point here</span>';
        var outboundHtml = outbound.length ? outbound.map(function (name) { return neighborButton(name, "downstream"); }).join("") : '<span class="empty-node">No foreign-key targets</span>';
        var rows = table.columns.map(function (column) {
          var type = column.type || "inferred";
          return '<div class="column-row">' +
            '<div class="column-name">' + escapeHtml(column.name) + (column.primaryKey ? '<span class="key-mark">PK</span>' : '') + '</div>' +
            '<div class="column-type">' + escapeHtml(type) + '</div>' +
            '<div class="column-description">' + escapeHtml(column.description) + '</div>' +
          '</div>';
        }).join("");
        content.innerHTML =
          '<section class="table-header"><div><div class="breadcrumb">' + escapeHtml(table.domain) + ' / table</div><h3>' + escapeHtml(table.name) + '</h3><p class="table-purpose">' + escapeHtml(table.purpose) + '</p><div class="badges"><span class="badge status-' + table.status + '">' + table.status + '</span><span class="badge">' + table.columns.length + ' columns</span><span class="badge">RLS enabled</span></div></div></section>' +
          '<section class="map-panel"><div class="panel-heading"><h4>Relationship focus</h4><span>' + inbound.length + ' inbound · ' + outbound.length + ' outbound</span></div>' +
            '<div class="relationship-map" role="group" aria-label="Relationships for ' + escapeHtml(table.name) + '">' +
              '<div class="node-stack"><div class="node-label">Points into this table</div>' + inboundHtml + '</div><div class="arrow-lane"></div>' +
              '<button type="button" class="graph-node center" data-table="' + escapeHtml(table.name) + '">' + escapeHtml(table.name) + '</button><div class="arrow-lane"></div>' +
              '<div class="node-stack"><div class="node-label">This table points to</div>' + outboundHtml + '</div>' +
            '</div></section>' +
          '<section class="columns-panel" aria-label="Columns in ' + escapeHtml(table.name) + '"><div class="columns-head"><span>Column</span><span>Type / role</span><span>What it holds</span></div>' + rows + '</section>';
      }

      function render() {
        renderNav();
        var selected = state.selected ? tableByName.get(state.selected) : null;
        if (selected) renderTable(selected); else renderOverview();
      }

      function chooseTable(name) {
        if (!tableByName.has(name)) return;
        state.selected = name;
        state.domain = "all";
        render();
        document.querySelector(".main").scrollIntoView({ behavior: "smooth", block: "start" });
      }

      document.addEventListener("click", function (event) {
        var tableButton = event.target.closest("[data-table]");
        if (tableButton) { chooseTable(tableButton.dataset.table); return; }
        var domainButton = event.target.closest("[data-domain]");
        if (domainButton) {
          state.domain = domainButton.dataset.domain;
          state.selected = null;
          render();
        }
      });

      document.querySelectorAll("[data-scope]").forEach(function (button) {
        button.addEventListener("click", function () {
          state.scope = button.dataset.scope;
          state.selected = null;
          document.querySelectorAll("[data-scope]").forEach(function (item) { item.classList.toggle("active", item === button); });
          render();
        });
      });

      search.addEventListener("input", function () {
        state.search = search.value.trim().toLowerCase();
        state.domain = "all";
        state.selected = null;
        render();
      });
      search.addEventListener("keydown", function (event) { if (event.key === "Escape") { search.value = ""; search.dispatchEvent(new Event("input")); } });
      document.getElementById("show-overview").addEventListener("click", function () { state.selected = null; state.domain = "all"; render(); });
      render();
    }());
  </script>
</body>
</html>`;
}

const defaultInput = resolve("docs/database-map.md");
const defaultOutput = resolve("docs/database-explorer.html");
const inputPath = resolve(readArgument("--input", defaultInput));
const outputPath = resolve(readArgument("--output", defaultOutput));
const schema = parseDatabaseMap(readFileSync(inputPath, "utf8"));
writeFileSync(outputPath, renderArtifact(schema), "utf8");
console.log(`Generated ${outputPath} with ${schema.totals.tables} tables and ${schema.totals.columns} columns.`);
