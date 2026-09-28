import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as background from "../../src/calendar/background-refresh.ts";
import * as syncStatus from "../../src/calendar/sync-status.ts";

type Element = { type: unknown; props: Record<string, unknown> };
function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const item = node as Element;
  return [item, ...elements(item.props.children)];
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  return node && typeof node === "object" && "props" in node ? text((node as Element).props.children) : "";
}

test("shared mentor schedule queues one Google refresh and keeps its availability editor", async () => {
  const previousWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
  const previousDocument=Object.getOwnPropertyDescriptor(globalThis,"document");
  const timers=new Set<()=>void>();
  Object.defineProperty(globalThis,"window",{configurable:true,value:{setInterval:(callback:()=>void)=>{timers.add(callback);return callback;},clearInterval:(callback:()=>void)=>timers.delete(callback),addEventListener(){},removeEventListener(){}}});
  Object.defineProperty(globalThis,"document",{configurable:true,value:{visibilityState:"visible",addEventListener(){},removeEventListener(){}}});
  const states:unknown[]=[],refs:{current:unknown}[]=[],effects:{deps:unknown[];cleanup?:()=>void}[]=[];
  let si=0,ri=0,ei=0;
  const pendingEffects:(()=>void)[]=[];
  const hooks={
    useState(initial:unknown){const i=si++;if(!(i in states))states[i]=initial;return[states[i],(next:unknown)=>{states[i]=typeof next==="function"?(next as (old:unknown)=>unknown)(states[i]):next;}];},
    useRef(initial:unknown){return refs[ri++]??=( {current:initial} );},
    useEffect(run:()=>void|(()=>void),deps:unknown[]){const i=ei++,old=effects[i];if(old&&deps.length===old.deps.length&&deps.every((v,j)=>Object.is(v,old.deps[j])))return;pendingEffects.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:run()??undefined};});},
  };
  let requests=0;
  const fetcher:typeof fetch=async(url,init)=>{
    if(String(url)==="/api/calendar/sync"){requests++;assert.equal(init?.method,"POST");return Response.json({queued:true},{status:202});}
    if(String(url).startsWith("/api/calendar/settings?")) return Response.json({mode:"synced",timeZone:"America/New_York",connectionId:"connection",workingHours:[]});
    return Response.json({});
  };
  const require=createRequire(import.meta.url);
  const output=ts.transpileModule(readFileSync("components/calendar/MentorCalendarSettings.tsx","utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports:Record<string,unknown>={};
  new Function("require","exports",output)((name:string)=>name==="react"?hooks:name==="@/src/auth/authenticated-fetch"?{authenticatedFetch:fetcher}:name==="@/src/calendar/background-refresh"?background:name==="@/src/calendar/sync-status"?syncStatus:name==="./IntegratedAvailabilityCalendar"?{IntegratedAvailabilityCalendar:()=>null}:require(name),exports);
  const Component=exports.MentorCalendarSettings as (props:Record<string,unknown>)=>Element;
  const render=()=>{si=0;ri=0;ei=0;const tree=Component({semesterId:"semester",connectionId:"connection",canSync:true,onSaved:()=>assert.fail("quiet sync must not trigger a full-page reload")});pendingEffects.splice(0).forEach(run=>run());return tree;};
  const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
  const click=(element:Element)=> (element.props.onClick as ()=>void)();
  try{
    render();await settle();let tree=render();
    const button=elements(tree).find(item=>item.type==="button"&&text(item)==="Refresh Google Calendar");assert.ok(button);
    const calendar=elements(tree).find(item=>typeof item.props.onWorkingHoursChange==="function");
    assert.ok(calendar,"the shared availability editor remains mounted");
    click(button);click(button);await settle();tree=render();
    assert.equal(requests,1);assert.match(text(tree),/refresh queued/i);
    assert.ok(elements(tree).some(item=>typeof item.props.onWorkingHoursChange==="function"));
    assert.doesNotMatch(text(tree),/Add slot|Edit hours/);
  }finally{
    effects.forEach(effect=>effect.cleanup?.());
    if(previousWindow)Object.defineProperty(globalThis,"window",previousWindow);else Reflect.deleteProperty(globalThis,"window");
    if(previousDocument)Object.defineProperty(globalThis,"document",previousDocument);else Reflect.deleteProperty(globalThis,"document");
  }
});
