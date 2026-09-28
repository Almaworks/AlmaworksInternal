"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataLoading } from "@/components/DataLoading";



import { outreachFetch } from "@/app/dashboard/admin/outreach/components/authenticated-fetch";

import type { OutreachEmailCommand, OutreachEmailTemplate, OutreachEmailWorkspaceResponse } from "@/src/outreach-email/types";



import { outreachEmailStarterPurposeLabels, renderOutreachEmailTemplate } from "@/src/outreach-email/model";

import { formatEnumLabel, formatTimeZoneLabel } from "@/src/presentation/display-labels";

import { previewMutation } from "./preview-state";



import { canReleaseFailedDraft, canSchedule, isOutreachEmailWorkspace, isValidTimeZone, outreachEmailTemplateImportExample, parseImportedOutreachEmailTemplate, scheduleLabel } from "./presentation";

import styles from "./outreach-email.module.css";

import { emailBodyParts } from "@/src/outreach-email/links";

import { PersonalGmail } from "./PersonalGmail";



type Props = { semesterId: string; opportunityId?: string | null; previewData?: OutreachEmailWorkspaceResponse; compact?: boolean; onSent?: () => void };

type Draft = { templateId: string | null; subject: string; body: string; scheduledAt: string };

const emptyDraft: Draft = { templateId: null, subject: "", body: "", scheduledAt: "" };



function errorMessage(value: unknown): string | null { return typeof value === "object" && value !== null && "error" in value && typeof value.error === "object" && value.error !== null && "message" in value.error && typeof value.error.message === "string" ? value.error.message : null; }

function workspaceFrom(value: unknown): OutreachEmailWorkspaceResponse | null { if (typeof value !== "object" || value === null || !("data" in value) || typeof value.data !== "object" || value.data === null) return null; const candidate = "workspace" in value.data ? value.data.workspace : value.data; return isOutreachEmailWorkspace(candidate) ? candidate : null; }

function mutationMessageId(value: unknown): string | null { return typeof value === "object" && value !== null && "data" in value && typeof value.data === "object" && value.data !== null && "messageId" in value.data && (typeof value.data.messageId === "string" || value.data.messageId === null) ? value.data.messageId : null; }

function localDateTime(value: string): string { const date = new Date(value); const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }



export function OutreachEmailWorkspace({ semesterId, opportunityId, previewData, compact = false, onSent }: Props) {

  const [workspace, setWorkspace] = useState<OutreachEmailWorkspaceResponse | null>(previewData ?? null);

  const [purpose, setPurpose] = useState("");

  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const [loading, setLoading] = useState(previewData === undefined);

  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [gmailBusy, setGmailBusy] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const [templateName, setTemplateName] = useState("");

  const [variableTarget, setVariableTarget] = useState<"subject" | "body">("body");

  const [selectedTemplate, setSelectedTemplate] = useState<OutreachEmailTemplate | null>(null);

  const [pendingSubmit, setPendingSubmit] = useState<Extract<OutreachEmailCommand, { action: "submit_message" }> | null>(null);

  const importFileInput = useRef<HTMLInputElement>(null);

  const pendingMessageId = useRef<string | null>(null);

  const actionBusy = useRef(false);

  const epoch = useRef(0);

  const scope = `${semesterId}:${opportunityId ?? "library"}`;

  const scopeRef = useRef(scope);

  if (scopeRef.current !== scope) { scopeRef.current = scope; epoch.current += 1; }



  const load = useCallback(async () => {

    const current = epoch.current + 1; epoch.current = current;

    if (previewData) { setWorkspace(current => current ?? previewData); setLoading(false); return; }

    setLoading(true); setError(null);

    try {

      const query = new URLSearchParams({ semesterId }); if (opportunityId) query.set("opportunityId", opportunityId);

      const response = await outreachFetch(`/api/admin/outreach/email?${query}`);

      const next = workspaceFrom(await response.json().catch(() => null));

      if (!response.ok || !next) throw new Error("Email workspace could not be loaded.");

      if (epoch.current !== current || scopeRef.current !== scope) return;

      if (next.semesterId !== semesterId || (opportunityId ? next.opportunity !== null && next.opportunity.opportunityId !== opportunityId : next.opportunity !== null)) throw new Error("The email response did not match the selected contact and semester.");

      setWorkspace(next);

    } catch (cause) { if (epoch.current === current && scopeRef.current === scope) setError(cause instanceof Error ? cause.message : "Email workspace could not be loaded."); }

    finally { if (epoch.current === current) setLoading(false); }

  }, [opportunityId, previewData, scope, semesterId]);

  useEffect(() => { void load(); return () => { epoch.current += 1; }; }, [load]);



  const templates = useMemo(() => workspace ? [...workspace.starterTemplates, ...workspace.templates.filter((template) => template.archivedAt === null)] : [], [workspace]);

  function matchesScope(candidate: OutreachEmailWorkspaceResponse): boolean { return candidate.semesterId === semesterId && (opportunityId ? candidate.opportunity?.opportunityId === opportunityId : candidate.opportunity === null); }

  function chooseTemplate(template: OutreachEmailTemplate) { setPurpose(template.purpose ?? ""); setSelectedTemplate(template.source === "saved" ? template : null); setTemplateName(template.name); setDraft({ templateId: template.source === "saved" ? template.templateId : null, subject: template.subjectTemplate, body: template.bodyTemplate, scheduledAt: "" }); setStatus(null); }

  function newTemplate() { setSelectedTemplate(null); setTemplateName(""); setDraft(emptyDraft); setStatus(null); }

  function newEmail() { pendingMessageId.current = null; setSelectedTemplate(null); setTemplateName(""); setDraft(emptyDraft); setPendingSubmit(null); setIdempotencyKey(crypto.randomUUID()); setStatus(null); }

  function insertRecipientVariable(name: string) { setDraft(value => ({ ...value, [variableTarget]: `${value[variableTarget]}{{${name}}}` })); }

  async function importTemplate(file: File | null) {

    if (!file || draftLocked) return;

    if (!/\.(?:md|txt)$/iu.test(file.name) || file.size > 25_000) { setError("Choose a .md or .txt template smaller than 25 KB."); return; }

    try {

      const imported = parseImportedOutreachEmailTemplate(await file.text());

      setSelectedTemplate(null); setTemplateName(imported.name); setDraft({ templateId: null, subject: imported.subjectTemplate, body: imported.bodyTemplate, scheduledAt: "" });

      setError(null); setStatus("Template imported. Review the recipient variables, then save it to this semester.");

    } catch (cause) { setError(cause instanceof Error ? cause.message : "The template could not be imported."); }

  }

  function downloadTemplateExample() {

    const blob = new Blob([outreachEmailTemplateImportExample], { type: "text/markdown;charset=utf-8" });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a"); link.href = url; link.download = "almaworks-email-template.md"; document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);

  }

  async function command(command: OutreachEmailCommand, key: string) {

    if (actionBusy.current) return;

    if (previewData) {

      const next = previewMutation(workspace!, command);

      setWorkspace(next); setStatus("Preview updated on this page only.");

      if (command.action === "submit_message") { newEmail(); setStatus("Preview email recorded. No message was sent."); }

      if (command.action === "save_template") setSelectedTemplate(next.templates.find(t => t.archivedAt === null && (command.templateId ? t.templateId === command.templateId : t.name === command.name)) ?? null);

      if (command.action === "archive_template") newTemplate();

      return;

    }

    actionBusy.current = true;

    const current = epoch.current + 1; epoch.current = current; setBusy(key); setError(null); setStatus(null);

    try {

      const response = await outreachFetch("/api/admin/outreach/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });

      const payload: unknown = await response.json().catch(() => null);

      const next = workspaceFrom(payload);

      const affectedMessageId = mutationMessageId(payload);

      if (!response.ok || !next) {

        if (command.action === "submit_message" && canReleaseFailedDraft(response.status, pendingSubmit !== null)) setPendingSubmit(null);

        throw new Error(errorMessage(payload) ?? "Email action could not be completed. Recheck history before starting a new email.");

      }

      if (epoch.current !== current || scopeRef.current !== scope) return;

      if (next.semesterId !== semesterId) throw new Error("The email action returned a different semester.");

      if (command.action === "save_template") setSelectedTemplate(next.templates.find(t => t.archivedAt === null && (command.templateId ? t.templateId === command.templateId : t.name === command.name)) ?? null);

      if (command.action === "archive_template") newTemplate();

      if (command.action === "submit_message" || command.action === "retry_message" || command.action === "refresh_message" || command.action === "cancel_message") {

        const submitted = next.messages.find(message => message.messageId === affectedMessageId);

        if (command.action === "submit_message") pendingMessageId.current = affectedMessageId;

        if (submitted?.status === "submission_unknown" || submitted?.status === "prepared") {

          setStatus("The submission result is not confirmed. Recheck or retry the original email; do not create a replacement.");

        } else if (submitted) {

          if (command.action === "submit_message" || pendingMessageId.current === affectedMessageId) newEmail();

          setStatus(submitted.status === "scheduled" ? "Email scheduled." : submitted.status === "accepted" ? "Email accepted by the provider." : `Email status: ${formatEnumLabel(submitted.status)}.`);

        } else setStatus("The action completed, but its email result could not be identified. Recheck history.");

      } else setStatus("Template saved.");

      if (matchesScope(next)) setWorkspace(next);

      else { setBusy(null); actionBusy.current = false; void load(); }



    } catch (cause) { if (epoch.current === current && scopeRef.current === scope) setError(cause instanceof Error ? cause.message : "Email action could not be completed."); }

    finally { actionBusy.current = false; if (scopeRef.current === scope) setBusy(null); }

  }



  const current = workspace !== null && workspace.semesterId === semesterId && (workspace.opportunity === null || matchesScope(workspace)) ? workspace : null;

  if (loading) return <section className={styles.card}><DataLoading label="Loading email workspace" compact /></section>;

  if (error && !current) return <section className={styles.card}><p className={styles.notice} role="alert">{error}</p><button className={styles.secondary} type="button" onClick={() => void load()}>Try again</button></section>;

  if (!current) return <section className={styles.card}><DataLoading label="Loading email workspace" compact /></section>;

  const { configuration, opportunity } = current;

  const scheduledInstant = draft.scheduledAt === "" || Number.isNaN(Date.parse(draft.scheduledAt)) ? null : new Date(draft.scheduledAt).toISOString();

  const scheduleIsValid = draft.scheduledAt === "" || (scheduledInstant !== null && canSchedule(scheduledInstant, new Date()));

  const sendDisabled = busy !== null || !configuration.available || opportunity === null || (!pendingSubmit && (!draft.subject.trim() || !draft.body.trim() || !scheduleIsValid));

  const submit = () => { if (pendingSubmit) { void command(pendingSubmit, "submit"); return; } if (!opportunity || !rendered || previewError || (draft.scheduledAt !== "" && scheduledInstant === null)) return; const commandPayload: Extract<OutreachEmailCommand, { action: "submit_message" }> = { action: "submit_message", semesterId, opportunityId: opportunity.opportunityId, templateId: draft.templateId, subject: rendered?.subject ?? "", body: rendered?.body ?? "", scheduledAt: scheduledInstant, idempotencyKey }; setPendingSubmit(commandPayload); void command(commandPayload, "submit"); };

  let rendered: { subject: string; body: string } | null = null;

  let previewError: string | null = null;

  if (opportunity && draft.subject.trim() && draft.body.trim()) {

    try { rendered = renderOutreachEmailTemplate({ subjectTemplate: draft.subject, bodyTemplate: draft.body, values: { contact_name: opportunity.recipientName, company_name: opportunity.companyName ?? "", semester_name: opportunity.semesterName, job_title: opportunity.jobTitle ?? "", mentor_onboarding_url: configuration.mentorOnboardingUrl ?? "" } }); }

    catch (cause) { previewError = cause instanceof Error ? cause.message : "Review the template placeholders."; }

  }

  const draftLocked = gmailBusy || busy !== null || pendingSubmit !== null;

  const personalize = () => {

    if (!rendered || draftLocked) return;

    setDraft(value => ({ ...value, templateId: null, subject: rendered.subject, body: rendered.body }));

    setSelectedTemplate(null);

    setStatus("Contact details filled in. Edit this individual draft below; the reusable template is unchanged.");

  };

  const editor = <div className={styles.form}>

    <label>Subject<input aria-label="Subject" maxLength={500} disabled={draftLocked} value={draft.subject} onFocus={() => setVariableTarget("subject")} onChange={event => setDraft(value => ({ ...value, subject: event.target.value }))} /></label>

    <label>Email body<textarea aria-label="Email body" maxLength={20000} disabled={draftLocked} value={draft.body} onFocus={() => setVariableTarget("body")} onChange={event => setDraft(value => ({ ...value, body: event.target.value }))} /></label>

    <div className={styles.variables}><p className={styles.muted}>Recipient variables are filled from the selected outreach contact when an email is composed. Choose where to add one, then select a variable.</p><label>Insert into<select disabled={draftLocked} value={variableTarget} onChange={event => setVariableTarget(event.target.value as "subject" | "body")}><option value="body">Body</option><option value="subject">Subject</option></select></label><div className={styles.variableActions}>{current.supportedPlaceholders.map(name => <button className={styles.secondary} type="button" disabled={draftLocked} key={name} onClick={() => insertRecipientVariable(name)}>{`{{${name}}}`}</button>)}</div></div>

  </div>;

  return <section className={styles.shell} aria-live="polite"><header className={styles.header}><div><p className={styles.eyebrow}>Outreach email</p><h1>{compact ? "Email this contact" : "Email templates & delivery"}</h1><p>{compact ? "Choose a purpose and editable template, then review the personalized draft for this contact." : "Manage reusable email templates and review provider delivery records."}</p></div><div className={styles.variableActions}><button className={styles.primary} type="button" disabled={draftLocked} onClick={() => importFileInput.current?.click()}>Import template</button><button className={styles.secondary} type="button" onClick={downloadTemplateExample}>Download template format</button></div></header>{previewData && !configuration.available && <p className={styles.notice} role="alert">Sending is not connected yet. You can prepare drafts and save reusable templates.</p>}{error && <p className={styles.notice} role="alert">{error}</p>}{status && <p className={styles.status} role="status">{status}</p>}<div className={styles.layout}><aside className={styles.card}><h2>Templates</h2><div className={styles.form}><label>Outreach purpose<select value={purpose} disabled={draftLocked} onChange={event => { const nextPurpose = event.target.value; setPurpose(nextPurpose); const starter = current.starterTemplates.find(template => template.purpose === nextPurpose); if (starter) chooseTemplate(starter); }}><option value="">All templates / custom</option>{Object.entries(outreachEmailStarterPurposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className={styles.muted}>Choose what you are requesting for this email. This does not change the contact’s categories or pipeline stage.</p></div><p className={styles.muted}>Starter copy is editable before sending. Saved templates belong to this semester.</p><ul className={styles.templateList}>{templates.filter(template => !purpose || !template.purpose || template.purpose === purpose).map((template) => <li key={`${template.source}:${template.templateId}`}><button type="button" aria-pressed={draft.subject === template.subjectTemplate && draft.body === template.bodyTemplate} disabled={draftLocked} onClick={() => chooseTemplate(template)}><strong>{template.name}</strong><small>{template.source === "starter" ? "Starter draft" : "Saved template"}</small></button></li>)}</ul><div className={styles.importer}><h3>Import a template</h3><p className={styles.muted}>Use the documented .md or .txt format with a template name, subject, blank line, and email body. Use [form](https://example.com) for a labeled link in Gmail.</p><input ref={importFileInput} aria-label="Import an email template file" accept=".md,.txt,text/markdown,text/plain" disabled={draftLocked} type="file" onChange={event => { void importTemplate(event.currentTarget.files?.[0] ?? null); event.currentTarget.value = ""; }} /><div className={styles.variableActions}><button className={styles.secondary} type="button" onClick={downloadTemplateExample}>Download sample</button><details><summary>View format</summary><pre>{outreachEmailTemplateImportExample}</pre></details></div></div><div className={styles.form}><label>Template name<input maxLength={120} disabled={draftLocked} value={templateName} onChange={(event) => setTemplateName(event.target.value)} /></label><button className={styles.primary} type="button" disabled={draftLocked || !templateName.trim() || !draft.subject.trim() || !draft.body.trim()} onClick={() => void command({ action: "save_template", semesterId, templateId: selectedTemplate?.templateId, expectedUpdatedAt: selectedTemplate?.updatedAt ?? undefined, name: templateName.trim(), subjectTemplate: draft.subject.trim(), bodyTemplate: draft.body.trim() }, "template")}>{selectedTemplate ? "Save changes" : "Save as template"}</button>{selectedTemplate?.updatedAt && <button className={styles.danger} type="button" disabled={draftLocked} onClick={() => void command({ action: "archive_template", semesterId, templateId: selectedTemplate.templateId, expectedUpdatedAt: selectedTemplate.updatedAt! }, "archive")}>Archive template</button>}<button className={styles.secondary} type="button" disabled={draftLocked} onClick={newTemplate}>New template</button></div></aside><div className={styles.card}>{opportunity ? <><h2>Compose for this contact</h2><p className={styles.muted}>Personalize this draft, review the preview, then use your Gmail connection below to send it.</p><dl className={styles.summary}><div><dt>To</dt><dd>{opportunity.recipientName} · {opportunity.recipientEmail}</dd></div><div><dt>Timezone</dt><dd>{isValidTimeZone(configuration.timeZone) ? formatTimeZoneLabel(configuration.timeZone) : "Timezone unavailable"}</dd></div></dl>{!configuration.mentorOnboardingUrl && (draft.body.includes("mentor_onboarding_url") || draft.subject.includes("mentor_onboarding_url")) && <p className={styles.notice}>Mentor onboarding link pending: the public site address has not been configured. Mentor invitations using that variable cannot be personalized or sent yet.</p>}{editor}<div className={styles.form}><button type="button" className={styles.secondary} disabled={draftLocked || !rendered || !!previewError} onClick={personalize}>Fill contact details into draft</button>{rendered && <div className={styles.preview}><h3>Email preview</h3><strong>{rendered.subject}</strong><p>{emailBodyParts(rendered.body).map((part, index) => part.href ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a> : part.text)}</p></div>}{previewError && <p className={styles.notice} role="alert">{previewError}</p>}{previewData && <><label>Schedule for later <span className={styles.muted}>(your browser timezone; within 30 days)</span><input type="datetime-local" disabled={draftLocked} min={localDateTime(new Date(Date.now() + 60000).toISOString())} max={localDateTime(new Date(Date.now() + 30 * 86400000).toISOString())} value={draft.scheduledAt} onChange={(event) => setDraft((value) => ({ ...value, scheduledAt: event.target.value }))} /></label>{!scheduleIsValid && <p className={styles.notice}>Choose a future time no more than 30 days away.</p>}<div className={styles.actions}><button type="button" className={styles.secondary} onClick={newEmail} disabled={draftLocked}>New email</button><button type="button" className={styles.primary} disabled={sendDisabled || (!pendingSubmit && previewError !== null)} onClick={submit}>{busy === "submit" ? "Submitting…" : pendingSubmit ? "Retry same request" : draft.scheduledAt ? "Schedule email" : "Send email"}</button></div></>}</div></> : <><h2>{selectedTemplate ? "Edit template" : "Create a template"}</h2>{opportunityId && <p className={styles.notice}>This contact is not eligible for email. Add an email address and check that the contact is active, not silenced, declined, or closed.</p>}{editor}<p className={styles.muted}>Save this reusable copy, then open a contact from Outreach to send it.</p></>}{pendingSubmit && <p role="status" className={styles.notice}>This draft is locked while its result is unresolved. Retry the same request or recheck its history record.</p>}{!previewData && <PersonalGmail key={scope} semesterId={semesterId} opportunityId={opportunityId} recipient={opportunity?.recipientEmail} draft={previewError ? null : rendered} unsavedDraft={draft} onBusyChange={setGmailBusy} onSent={() => { newEmail(); onSent?.(); }} onRestoreDraft={saved => setDraft({ ...saved, templateId: null, scheduledAt: "" })} />}<h2 className={styles.historyHeading}>Previous provider history</h2><ul className={styles.history}>{current.messages.map((message) => <li key={message.messageId}><div><strong>{message.subject}</strong><small>{message.recipientName} · {message.scheduledAt ? `Scheduled ${scheduleLabel(message.scheduledAt, configuration.timeZone)}` : `Created ${scheduleLabel(message.createdAt, configuration.timeZone)}`}</small>{message.lastError && <small>{message.lastError}</small>}</div><div className={styles.actions}><span>{formatEnumLabel(message.status)}</span>{message.canRefresh && <button className={styles.secondary} type="button" disabled={busy !== null} onClick={() => void command({ action: "refresh_message", semesterId, messageId: message.messageId }, message.messageId)}>Recheck</button>}{message.canCancel && <button className={styles.danger} type="button" disabled={busy !== null} onClick={() => void command({ action: "cancel_message", semesterId, messageId: message.messageId }, message.messageId)}>Cancel</button>}{message.canRetry && <button className={styles.secondary} type="button" disabled={busy !== null} onClick={() => void command({ action: "retry_message", semesterId, messageId: message.messageId }, message.messageId)}>Retry safely</button>}</div></li>)}</ul>{current.messages.some((message) => message.status === "scheduled" && message.canCancel) && <p className={styles.notice}>A scheduled email continues even if this contact is later archived or silenced. Cancel it here if plans change.</p>}</div></div></section>;

}

