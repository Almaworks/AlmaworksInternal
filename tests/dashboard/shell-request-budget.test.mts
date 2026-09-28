import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("self-contained dashboards do not mount the unused shell's Supabase client", () => {
  let pathname = "/dashboard/mentor";
  let clientCreations = 0;
  const require = createRequire(import.meta.url);
  const dependencies: Record<string, unknown> = {
    "@/utils/supabase/client": { createClient: () => { clientCreations += 1; return {}; } },
    "next/navigation": { usePathname: () => pathname, useSearchParams: () => new URLSearchParams(), useRouter: () => ({}) },
    "next/link": { default: ({ children }: { children: ReactNode }) => createElement("a", null, children) },
    "@/components/AlmaworksBrand": { AlmaworksBrand: () => null },
    "@/components/AdminViewAsControl": { AdminViewAsControl: () => null },
    "@/components/AdminViewTransitionShell": { AdminViewTransitionShell: () => null },
    "@/components/DataLoading": { DataLoading: () => null },
    "@/src/assignments/schedule-navigation": { isDashboardNavigationActive: () => false },
    "@/src/auth/admin-capability": { resolveDashboardPersona: () => null },
    "@/src/auth/authenticated-fetch": {},
    "@/src/program/canonical-access": {},
    "@/src/dashboard/participant-preview": { resolveAdminViewTransition: () => ({ loading: false }) },
  };
  const compiled = ts.transpileModule(readFileSync(new URL("../../app/dashboard/layout.tsx", import.meta.url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  });
  const exports = {} as { default: ComponentType<{ children?: ReactNode }> };
  new Function("require", "exports", compiled.outputText)((name: string) => dependencies[name] ?? require(name), exports);
  const render = () => renderToStaticMarkup(createElement(exports.default, null, "owned workspace"));
  for (const route of ["/dashboard/mentor", "/dashboard/startup", "/dashboard/onboarding", "/dashboard/admin/preview/mentor", "/dashboard/admin/preview/startup"]) {
    pathname = route;
    assert.match(render(), /owned workspace/u);
    assert.equal(clientCreations, 0, route);
  }
  pathname = "/dashboard/admin";
  assert.match(render(), /Dashboard sidebar/u);
  assert.equal(clientCreations, 1, "ordinary modules retain their shell");
});
