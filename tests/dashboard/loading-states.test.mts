import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("remote loading communicates progress accessibly and honors reduced motion", async () => {
  const source = await readFile(new URL("../../components/DataLoading.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } });
  const compiledModule = { exports: {} as { DataLoading: ComponentType<{ label: string; compact?: boolean }> } };
  new Function("require", "exports", compiled.outputText)(createRequire(import.meta.url), compiledModule.exports);
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(compiledModule.exports.DataLoading, { label: "Loading bookings", compact }));
    assert.match(html, /role="status"/u);
    assert.match(html, /aria-busy="true"/u);
    assert.match(html, /Loading bookings/u);
    assert.match(html, /motion-reduce:animate-none/u);
  }
});

test("bookings waits for semester discovery before mounting remote workspace", async () => {
  const source = await readFile(new URL("../../app/dashboard/bookings/page.tsx", import.meta.url), "utf8");
  assert.match(source, /loading \? <DataLoading[\s\S]*loadError[\s\S]*semesterId \? <MentorBookingWorkspace/u);
  assert.match(source, /No semesters are available/u);
});

test("module navigation provides immediate progress while hiding the previous module", async () => {
  const source = await readFile(new URL("../../app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /onNavigate=\{\(event\) => navigateModule/u);
  assert.match(source, /startNavigationTransition\(\(\) => router.push\(href\)\)/u);
  assert.match(source, /hidden=\{isNavigationPending\}/u);
});

test("booking workspace uses server availability without a browser-storage fallback", async () => {
  const source = await readFile(new URL("../../components/mentor-booking/MentorBookingWorkspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|readConfirmedAvailability|availabilityBlocksForDisplay/u);
  assert.match(source, /<StartupAvailabilityBrowser[\s\S]*data=\{data\}/u);
  assert.match(source, /onAvailabilitySaved=\{\(\) => void load\(\)\}/u);
});
