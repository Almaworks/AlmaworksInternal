import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import * as startupCalendar from "../../src/mentor-booking/startup-calendar.ts";
import * as weeklyParticipation from "../../src/mentor-booking/weekly-participation.ts";
import * as holdPresentation from "../../src/calendar/hold-presentation.ts";

type Element = { type: unknown; props: Record<string, unknown> };
type StateSetter = (value: unknown) => void;

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!node || typeof node !== "object" || !("props" in node)) return node;
  const element = node as Element;
  if (typeof element.type === "function") return expand((element.type as (props: Record<string, unknown>) => unknown)(element.props));
  return { ...element, props: { ...element.props, children: expand(element.props.children) } };
}

function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Element).props.children);
}

function hooksHarness() {
  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  const hooks = {
    useState(initial: unknown): [unknown, StateSetter] {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [states[index], (next) => { states[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[index]) : next; }];
    },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ??= { current: initial }; },
    useMemo(run: () => unknown) { return run(); },
    useCallback(value: unknown) { return value; },
    useEffect() {},
    useImperativeHandle() {},
    forwardRef(render: unknown) { return render; },
  };
  return { hooks, renderStart() { stateIndex = 0; refIndex = 0; }, remount() { states.length=0;refs.length=0;stateIndex=0;refIndex=0; }, states };
}

function compile(filename: string, requireModule: (name: string) => unknown) {
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {} as Record<string, unknown>;
  new Function("require", "exports", compiled.outputText)((name: string) => requireModule(name) ?? require(name), exports);
  return exports;
}

test("admin booking workspace shows both participants, accepted history, and read-only weekly availability without legacy windows", () => {
  const harness = hooksHarness();
  const Workspace = compile(path.resolve("components/mentor-booking/MentorBookingWorkspace.tsx"), (name) => {
    if (name === "react") return harness.hooks;
    if (name === "./BookingDetailsPanel") return { BookingDetailsPanel: () => null };
    if (name === "@/src/mentor-booking/weekly-participation") return weeklyParticipation;
    if (name === "@/src/calendar/hold-presentation") return holdPresentation;
    if (name === "lucide-react") return { CalendarClock: "calendar", Check: "check" };
    if (name === "./StartupAvailabilityBrowser") return { StartupAvailabilityBrowser: "startup-browser" };
    if (name === "./presentation") return { bookingDateTime: (value: string) => value, formatAvailabilityTimeLabel: (value: string) => value === "14:00" ? "2 PM" : "", isMentorBookingResponse: () => true, isCurrentMentorBookingResponse: () => true };
    if (name === "@/src/mentor-booking/meeting-sections") return { bookingSections: (history: Array<{ status: string; endsAt: string }>) => ({ pending: history.filter((request) => request.status === "pending"), upcoming: history.filter((request) => request.status === "accepted" && Date.parse(request.endsAt) > Date.now()), history: history.filter((request) => request.status === "accepted" && Date.parse(request.endsAt) <= Date.now()) }) };
    if (name === "@/src/mentor-booking/startup-availability") return { bookableCalendarWeek: () => ({ label: "Sep 20–26" }) };
    if (name.startsWith("@/")) return new Proxy({}, { get: () => () => [] });
    return undefined;
  }).default as (props: Record<string, unknown>) => Element;
  const previewData = {
    semesterId: "fall-2026", semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20", timeZone: "America/New_York", acceptedOccupancy: [],
    viewer: { role: "admin", profileId: "admin", mentorSemesterId: null, startupSemesterId: null }, windows: [],
    availability: [{ mentorSemesterId: "mentor-1", mentor: { profileId: "mentor-profile", name: "Ada Mentor" }, weekday: 1, startsAt: "13:45:00", endsAt: "14:00:00" }],
    history: [
      { requestId: "accepted-1", windowId: null, mentorSemesterId: "mentor-1", mentor: { profileId: "mentor-profile", name: "Ada Mentor" }, startupSemesterId: "startup-1", startup: { organizationId: "org-1", name: "Beacon Startup" }, startsAt: "2026-09-01T14:00:00.000Z", endsAt: "2026-09-01T14:30:00.000Z", topic: "Pricing", status: "accepted", requestedAt: "2026-08-20T14:00:00.000Z", respondedAt: "2026-08-21T14:00:00.000Z", cancelledAt: null, canAccept: false, canDecline: false, canCancel: false },
      { requestId: "accepted-2", windowId: null, mentorSemesterId: "mentor-3", mentor: { profileId: "mentor-profile-3", name: "Dara Mentor" }, startupSemesterId: "startup-3", startup: { organizationId: "org-3", name: "Elm Startup" }, startsAt: "2026-10-02T14:00:00.000Z", endsAt: "2026-10-02T14:30:00.000Z", topic: "Finance", status: "accepted", requestedAt: "2026-09-20T14:00:00.000Z", respondedAt: "2026-09-21T14:00:00.000Z", cancelledAt: null, canAccept: false, canDecline: false, canCancel: false },
      { requestId: "pending-1", windowId: null, mentorSemesterId: "mentor-2", mentor: { profileId: "mentor-profile-2", name: "Byron Mentor" }, startupSemesterId: "startup-2", startup: { organizationId: "org-2", name: "Cedar Startup" }, startsAt: "2026-10-01T14:00:00.000Z", endsAt: "2026-10-01T14:30:00.000Z", topic: "Hiring", status: "pending", requestedAt: "2026-09-20T14:00:00.000Z", respondedAt: null, cancelledAt: null, canAccept: false, canDecline: false, canCancel: false },
    ],
  };
  harness.renderStart();
  const tree = Workspace({ semesterId: "fall-2026", previewData });
  const renderedTree = expand(tree);
  const rendered = text(renderedTree);
  assert.match(rendered, /Ada Mentor/);
  assert.match(rendered, /Beacon Startup/);
  assert.match(rendered, /Booking history/);
  assert.match(rendered, /Pending requests/);
  assert.match(rendered, /Upcoming meetings/);
  assert.match(rendered, /Byron Mentor · Cedar Startup/);
  assert.match(rendered, /Dara Mentor · Elm Startup/);
  assert.match(rendered, /Weekly availability/);
  assert.match(rendered, /Monday 1:45 PM–2 PM/);
  assert.doesNotMatch(rendered, /No mentor availability is available right now/);
  assert.equal(elements(renderedTree).some((element) => element.props.children === "Withdraw window" || element.props.children === "Request window"), false);
  assert.equal(elements(renderedTree).some((element) => ["Accept", "Decline", "Cancel"].includes(String(element.props.children))), false);
  const statusData={...previewData,history:previewData.history.map(request=>({...request,calendarHoldStatus:"conflict"}))};
  harness.remount();
  assert.doesNotMatch(text(expand(Workspace({semesterId:"fall-2026",previewData:statusData}))),/Your Google Calendar is busy/);
  harness.remount();
  assert.match(text(expand(Workspace({semesterId:"fall-2026",previewData:{...statusData,viewer:{...statusData.viewer,role:"startup"}}}))),/Your Google Calendar is busy at this time/);
});

test("a successful startup request closes only its active dialog, while a failed request stays open with its topic and error", async () => {
  const harness = hooksHarness();
  const slot = { mentorSemesterId: "mentor-1", mentor: { profileId: "mentor-profile", name: "Ada Mentor" }, startsAt: "2026-09-20T14:00:00.000Z", endsAt: "2026-09-20T14:30:00.000Z" };
  let liveSlots = [slot];
  const Browser = compile(path.resolve("components/mentor-booking/StartupAvailabilityBrowser.tsx"), (name) => {
    if (name === "react") return harness.hooks;
    if (name === "./BookingDetailsPanel") return { BookingDetailsPanel: () => null };
    if (name === "@/src/mentor-booking/weekly-participation") return weeklyParticipation;
    if (name === "lucide-react") return { ChevronLeft: "left", ChevronRight: "right" };
    if (name === "./presentation") return { formatAvailabilityTimeLabel: () => "" };
    if (name === "@/src/mentor-booking/startup-availability") {
      const week = () => ({ startDate: "2026-09-20", endDate: "2026-09-26", dates: ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26"], label: "Sep 20–26" });
      return { startupBookingSlots: () => liveSlots, bookableCalendarWeek: week, currentCalendarWeek: week };
    }
    if (name === "@/src/mentor-booking/startup-calendar") return startupCalendar;
    return undefined;
  }).StartupAvailabilityBrowser as (props: Record<string, unknown>) => Element;
  const data = { semesterId: "fall-2026", semesterStartDate: "2026-09-01", semesterEndDate: "2026-12-20", timeZone: "America/New_York", acceptedOccupancy: [], availability: [], windows: [], history: [], viewer: { role: "startup", profileId: "startup-profile", mentorSemesterId: null, startupSemesterId: "startup-1", startupNeeds: [] } };
  const render = (onRequest: () => Promise<boolean>, requestError?: string) => { harness.renderStart(); return Browser({ data, acting: false, onRequest, requestError, weekOffset: 0, onWeekChange: () => undefined }); };
  let tree = render(async () => true);
  const availableCell = elements(tree).find((element) => typeof element.props.onClick === "function" && String(element.props["aria-label"]).includes("mentor available"));
  assert.ok(availableCell);
  (availableCell.props.onClick as (event: { currentTarget: HTMLButtonElement }) => void)({ currentTarget: { focus() {} } as HTMLButtonElement });
  tree = render(async () => true);
  const topicInput = elements(tree).find((element) => element.props.placeholder === "What would you like to discuss?");
  assert.ok(topicInput);
  (topicInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Pricing" } });
  tree = render(async () => true);
  const requestButton = elements(tree).find((element) => element.props.children === "Request this time");
  assert.ok(requestButton);
  await (requestButton.props.onClick as () => Promise<void>)();
  tree = render(async () => true);
  assert.equal(elements(tree).some((element) => element.props.role === "dialog"), false);

  tree = render(async () => false, "This time was just booked.");
  const reopenCell = elements(tree).find((element) => typeof element.props.onClick === "function" && String(element.props["aria-label"]).includes("mentor available"));
  assert.ok(reopenCell);
  (reopenCell.props.onClick as (event: { currentTarget: HTMLButtonElement }) => void)({ currentTarget: { focus() {} } as HTMLButtonElement });
  tree = render(async () => false, "This time was just booked.");
  const failedTopicInput = elements(tree).find((element) => element.props.placeholder === "What would you like to discuss?");
  assert.ok(failedTopicInput);
  (failedTopicInput.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Pricing" } });
  tree = render(async () => false, "This time was just booked.");
  const failedButton = elements(tree).find((element) => element.props.children === "Request this time");
  assert.ok(failedButton);
  await (failedButton.props.onClick as () => Promise<void>)();
  tree = render(async () => false, "This time was just booked.");
  assert.ok(elements(tree).some((element) => element.props.role === "dialog"));
  assert.match(text(tree), /This time was just booked/);
  assert.ok(elements(tree).some((element) => element.props.value === "Pricing"));

  liveSlots = [];
  tree = render(async () => { assert.fail("A disappeared slot must not be submitted"); });
  assert.ok(elements(tree).some(element => element.props.role === "dialog"));
  assert.ok(elements(tree).some(element => element.props.value === "Pricing"));
  const unavailableButton = elements(tree).find(element => element.props.children === "Request this time");
  assert.equal(unavailableButton?.props.disabled, true);
  await (unavailableButton!.props.onClick as () => Promise<void>)();
  liveSlots = [slot];

  let finishRequest: ((success: boolean) => void) | undefined;
  tree = render(() => new Promise<boolean>((resolve) => { finishRequest = resolve; }));
  const guardedCell = elements(tree).find((element) => typeof element.props.onClick === "function" && String(element.props["aria-label"]).includes("mentor available"));
  assert.ok(guardedCell);
  (guardedCell.props.onClick as (event: { currentTarget: HTMLButtonElement }) => void)({ currentTarget: { focus() {} } as HTMLButtonElement });
  tree = render(() => new Promise<boolean>((resolve) => { finishRequest = resolve; }));
  const guardedTopic = elements(tree).find((element) => element.props.placeholder === "What would you like to discuss?");
  assert.ok(guardedTopic);
  (guardedTopic.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: "Pricing" } });
  tree = render(() => new Promise<boolean>((resolve) => { finishRequest = resolve; }));
  const guardedRequest = elements(tree).find((element) => element.props.children === "Request this time");
  assert.ok(guardedRequest);
  const pendingRequest = (guardedRequest.props.onClick as () => Promise<void>)();
  const close = elements(tree).find((element) => element.props["aria-label"] === "Close mentor picker");
  assert.ok(close);
  (close.props.onClick as () => void)();
  tree = render(() => new Promise<boolean>((resolve) => { finishRequest = resolve; }));
  const reopenedCell = elements(tree).find((element) => typeof element.props.onClick === "function" && String(element.props["aria-label"]).includes("mentor available"));
  assert.ok(reopenedCell);
  (reopenedCell.props.onClick as (event: { currentTarget: HTMLButtonElement }) => void)({ currentTarget: { focus() {} } as HTMLButtonElement });
  finishRequest?.(true);
  await pendingRequest;
  tree = render(() => Promise.resolve(true));
  assert.ok(elements(tree).some((element) => element.props.role === "dialog"));
});
