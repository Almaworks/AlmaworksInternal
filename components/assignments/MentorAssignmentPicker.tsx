"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  buildCommitPayload,
  canSubmitAssignment,
  deriveStartupNeeds,
  filterCandidates,
  selectCandidate,
  selectVisibleCandidate,
  type PickerCandidate,
  type PickerFormat,
  type PickerTimeSlot,
} from "@/src/assignments/picker";
import { authenticatedFetch } from "@/src/auth/authenticated-fetch";

import styles from "./assignment-picker.module.css";

export interface AssignmentPickerTarget {
  semesterId: string;
  startupSemesterId: string;
  startupName: string;
  sessionDateId: string;
  date: string;
  timeSlot: PickerTimeSlot;
  initialFormat?: PickerFormat;
  initialTopic?: string;
  existingMentorName?: string | null;
}

interface CandidateStartup {
  id: string;
  companySnapshot: string | null;
  goals: string[];
  mentorNeedContext: string | null;
  mentorNeedNoPreference: boolean;
  mentorshipNeeds: string[];
  preferredExpertiseTags: string[];
  stage: string | null;
}

interface CandidateContext {
  startup: CandidateStartup;
  slot: {
    id: string;
    semesterId: string;
    date: string;
    start: string;
    end: string;
    format: "in_person" | "remote" | "hybrid";
  };
  candidates: PickerCandidate[];
}

export interface AssignmentCommitResult {
  sessionId: string;
  requestId: string;
  auditId: string;
  replayed: boolean;
}

interface MentorAssignmentPickerProps {
  open: boolean;
  target: AssignmentPickerTarget | null;
  onClose: () => void;
  onCommitted: (result: AssignmentCommitResult, target: AssignmentPickerTarget) => void | Promise<void>;
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    field?: string;
  };
}

const formatLabels: Record<PickerFormat, string> = {
  online: "Online",
  in_person: "In person",
  hybrid: "Hybrid",
};

function responseError(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null || !("error" in payload)) return fallback;
  const envelope = payload as ErrorEnvelope;
  const message = envelope.error?.message;
  if (typeof message !== "string" || message.trim().length === 0) return fallback;
  return envelope.error?.field ? `${message} (${envelope.error.field})` : message;
}

function readableDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function readableSlot(slot: PickerTimeSlot): string {
  return slot === "3:30-4:15" ? "3:30–4:15 PM" : "4:15–5:00 PM";
}

function unique(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

export default function MentorAssignmentPicker({ open, target, onClose, onCommitted }: MentorAssignmentPickerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [context, setContext] = useState<CandidateContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expertiseFilter, setExpertiseFilter] = useState("");
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);
  const [format, setFormat] = useState<PickerFormat>("in_person");
  const [topic, setTopic] = useState("");
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    if (!open || target === null) return;
    setContext(null);
    setSearch("");
    setExpertiseFilter("");
    setSelectedMentorId(null);
    setFormat(target.initialFormat ?? "in_person");
    setTopic(target.initialTopic ?? "");
    setOverrideAcknowledged(false);
    setOverrideReason("");
    setLoadError(null);
    setSubmitError(null);
  }, [open, target]);

  useEffect(() => {
    if (!open || target === null) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
      openerRef.current = null;
    };
  }, [open, target]);

  useEffect(() => {
    if (!open || target === null) return;
    const abortController = new AbortController();
    const query = new URLSearchParams({
      semesterId: target.semesterId,
      startupSemesterId: target.startupSemesterId,
      sessionDateId: target.sessionDateId,
      timeSlot: target.timeSlot,
      format,
    });
    setLoading(true);
    setLoadError(null);
    setSubmitError(null);
    setSelectedMentorId(null);
    setOverrideAcknowledged(false);
    setOverrideReason("");
    void authenticatedFetch(`/api/admin/assignments/candidates?${query.toString()}`, { signal: abortController.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseError(payload, "Unable to load mentor candidates."));
        if (typeof payload !== "object" || payload === null || !("data" in payload)) {
          throw new Error("The candidate response was incomplete.");
        }
        setContext((payload as { data: CandidateContext }).data);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setContext(null);
        setLoadError(error instanceof Error ? error.message : "Unable to load mentor candidates.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });
    return () => abortController.abort();
  }, [format, open, target]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open, submitting]);

  const expertiseOptions = useMemo(() => (
    unique((context?.candidates ?? []).flatMap((candidate) => candidate.mentor.expertise))
      .sort((left, right) => left.localeCompare(right))
  ), [context]);
  const visibleCandidates = useMemo(() => (
    filterCandidates(context?.candidates ?? [], search, expertiseFilter)
  ), [context, expertiseFilter, search]);
  const selectedCandidate = useMemo(() => (
    selectedMentorId === null ? null : selectVisibleCandidate(visibleCandidates, selectedMentorId)
  ), [selectedMentorId, visibleCandidates]);
  const needs = useMemo(() => deriveStartupNeeds({
    mentorshipNeeds: context?.startup.mentorshipNeeds ?? [],
    preferredExpertiseTags: context?.startup.preferredExpertiseTags ?? [],
  }), [context]);
  const submitEnabled = canSubmitAssignment(selectedCandidate, overrideAcknowledged, overrideReason) && !submitting;

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || panelRef.current === null) return;
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
    )).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function chooseCandidate(mentorProfileId: string) {
    const candidate = selectCandidate(context?.candidates ?? [], mentorProfileId);
    if (candidate === null) return;
    setSelectedMentorId(candidate.mentor.id);
    setOverrideAcknowledged(false);
    setOverrideReason("");
    setSubmitError(null);
  }

  async function submitAssignment(event: React.FormEvent) {
    event.preventDefault();
    if (target === null || context === null || selectedCandidate === null) return;
    if (!canSubmitAssignment(selectedCandidate, overrideAcknowledged, overrideReason)) {
      setSubmitError("Acknowledge every required override and provide a reason before assigning.");
      return;
    }
    const candidateRank = context.candidates.findIndex((candidate) => candidate.mentor.id === selectedCandidate.mentor.id) + 1;
    const payload = buildCommitPayload({
      semesterId: target.semesterId,
      startupSemesterId: target.startupSemesterId,
      sessionDateId: target.sessionDateId,
      timeSlot: target.timeSlot,
      format,
      topic,
      candidate: selectedCandidate,
      candidateRank,
      search,
      expertiseFilter,
      overrideAcknowledged,
      overrideReason,
    });
    setSubmitting(true);
    setSubmitError(null);
    const idempotencyKey = window.crypto.randomUUID();
    try {
      const response = await authenticatedFetch("/api/admin/assignments/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const responsePayload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseError(responsePayload, "Unable to assign this mentor."));
      if (typeof responsePayload !== "object" || responsePayload === null || !("data" in responsePayload)) {
        throw new Error("The assignment response was incomplete.");
      }
      await onCommitted((responsePayload as { data: AssignmentCommitResult }).data, target);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to assign this mentor.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || target === null) return null;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleDialogKeyDown}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Mentor assignment</p>
            <h2 id={titleId}>{target.startupName}</h2>
            <p id={descriptionId} className={styles.slotLine}>
              {readableDate(target.date)} · {readableSlot(target.timeSlot)}
            </p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} disabled={submitting} aria-label="Close mentor assignment">
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <form className={styles.form} onSubmit={submitAssignment}>
          <section className={styles.startupContext} aria-labelledby={`${titleId}-needs`}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>Startup context</p>
                <h3 id={`${titleId}-needs`}>Mentor Needs</h3>
              </div>
              {context?.startup.mentorNeedNoPreference && <span className={styles.neutralBadge}>No preference</span>}
            </div>
            <div className={styles.needGrid}>
              <div>
                <span>Primary</span>
                <strong>{needs.primary ?? "Not specified"}</strong>
              </div>
              <div>
                <span>Secondary</span>
                <strong>{needs.secondary ?? "Not specified"}</strong>
              </div>
            </div>
            {needs.preferredExpertise.length > 0 && (
              <div className={styles.preferredExpertise}>
                <span>Preferred expertise</span>
                <div>{needs.preferredExpertise.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </div>
            )}
            {(context?.startup.mentorNeedContext || context?.startup.companySnapshot) && (
              <p className={styles.contextCopy}>{context.startup.mentorNeedContext ?? context.startup.companySnapshot}</p>
            )}
            {context?.startup.goals && context.startup.goals.length > 0 && (
              <p className={styles.goals}><strong>Goals:</strong> {context.startup.goals.join(" · ")}</p>
            )}
            {target.existingMentorName && (
              <p className={styles.occupiedNotice}>
                <strong>Currently assigned:</strong> {target.existingMentorName}. The assignment API protects occupied slots; candidates with a startup-slot conflict remain disabled.
              </p>
            )}
          </section>

          <section className={styles.controls} aria-labelledby={`${titleId}-details`}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>Meeting details</p>
                <h3 id={`${titleId}-details`}>Format and topic</h3>
              </div>
            </div>
            <fieldset className={styles.formatGroup}>
              <legend>Supported format</legend>
              <div>
                {(Object.keys(formatLabels) as PickerFormat[]).map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name="meeting-format"
                      value={option}
                      checked={format === option}
                      onChange={() => setFormat(option)}
                    />
                    <span>{formatLabels[option]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className={styles.topicField}>
              <span>Topic <small>optional</small></span>
              <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What should this session focus on?" />
            </label>
          </section>

          <section className={styles.candidateSection} aria-labelledby={`${titleId}-candidates`}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionKicker}>Ranked for this slot</p>
                <h3 id={`${titleId}-candidates`}>Mentor candidates</h3>
              </div>
              {context && <span className={styles.count}>{visibleCandidates.length} of {context.candidates.length}</span>}
            </div>
            <div className={styles.filters}>
              <label>
                <span>Search mentors</span>
                <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name" />
              </label>
              <label>
                <span>Expertise</span>
                <select value={expertiseFilter} onChange={(event) => setExpertiseFilter(event.target.value)}>
                  <option value="">All expertise</option>
                  {expertiseOptions.map((expertise) => <option key={expertise} value={expertise}>{expertise}</option>)}
                </select>
              </label>
            </div>

            <div className={styles.status} aria-live="polite">
              {loading && <p>Loading ranked candidates…</p>}
              {loadError && <p className={styles.error}>{loadError}</p>}
            </div>

            {!loading && !loadError && (
              <div className={styles.candidateList} role="radiogroup" aria-label="Ranked mentor candidates">
                {visibleCandidates.map((candidate) => {
                  const rank = (context?.candidates.findIndex((item) => item.mentor.id === candidate.mentor.id) ?? -1) + 1;
                  const selected = selectedMentorId === candidate.mentor.id;
                  const requiresOverride = candidate.requiredOverrideTypes.length > 0;
                  return (
                    <label
                      key={candidate.mentor.id}
                      className={`${styles.candidateCard} ${selected ? styles.selected : ""} ${candidate.hardConflict ? styles.disabled : ""}`}
                    >
                      <input
                        type="radio"
                        name="mentor-candidate"
                        value={candidate.mentor.id}
                        checked={selected}
                        disabled={candidate.hardConflict}
                        onChange={() => chooseCandidate(candidate.mentor.id)}
                      />
                      <span className={styles.rank} aria-label={`Rank ${rank}`}>{rank}</span>
                      <span className={styles.candidateBody}>
                        <span className={styles.candidateTopline}>
                          <strong>{candidate.mentor.name}</strong>
                          <span className={styles.score}>{candidate.score} pts</span>
                        </span>
                        <span className={styles.tags}>
                          {candidate.mentor.expertise.length > 0
                            ? candidate.mentor.expertise.map((tag) => <span key={tag}>{tag}</span>)
                            : <span>No expertise tags</span>}
                        </span>
                        <span className={styles.reasonLine}>{candidate.reasons.join(" · ") || "No ranking signals available"}</span>
                        <span className={styles.explanations}>
                          {unique(candidate.explanations).filter((item) => !candidate.reasons.includes(item)).map((explanation) => (
                            <span key={explanation}>{explanation}</span>
                          ))}
                        </span>
                        <span className={styles.metaLine}>
                          <span>{candidate.mentor.assignmentLoad} assigned</span>
                          <span>{candidate.mentor.recentMeetingCount} recent meeting{candidate.mentor.recentMeetingCount === 1 ? "" : "s"}</span>
                          {candidate.hardConflict
                            ? <strong className={styles.conflictBadge}>Conflict · unavailable</strong>
                            : requiresOverride
                              ? <strong className={styles.overrideBadge}>Override required</strong>
                              : <strong className={styles.availableBadge}>Ready to assign</strong>}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {visibleCandidates.length === 0 && (
                  <p className={styles.empty}>No mentors match the current search and expertise filter.</p>
                )}
              </div>
            )}
          </section>

          {selectedCandidate && selectedCandidate.requiredOverrideTypes.length > 0 && (
            <section className={styles.overridePanel} aria-labelledby={`${titleId}-override`}>
              <h3 id={`${titleId}-override`}>Manual override required</h3>
              <p>This selection requires: {selectedCandidate.requiredOverrideTypes.join(", ").replaceAll("_", " ")}.</p>
              <label className={styles.acknowledge}>
                <input
                  type="checkbox"
                  checked={overrideAcknowledged}
                  onChange={(event) => setOverrideAcknowledged(event.target.checked)}
                />
                <span>I reviewed these conditions and explicitly approve the override.</span>
              </label>
              <label className={styles.reasonField}>
                <span>Override reason</span>
                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  placeholder="Explain why this assignment is appropriate."
                  required
                />
              </label>
            </section>
          )}

          <div className={styles.submitStatus} aria-live="assertive">
            {submitError && <p className={styles.error}>{submitError}</p>}
          </div>
          <footer className={styles.footer}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className={styles.primaryButton} disabled={!submitEnabled}>
              {submitting ? "Assigning…" : selectedCandidate ? `Assign ${selectedCandidate.mentor.name}` : "Select a mentor"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
