"use client";

import { Check, Clock3, UsersRound, X } from "lucide-react";

import type { ParticipantSessionView } from "@/src/dashboard/participant-dashboard";
import { sessionRsvpLabel, type SessionRsvpResponse } from "@/src/sessions/rsvp";
import styles from "@/app/design-preview/participant-dashboard/participant-dashboard.module.css";

function dateParts(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return {
    month: date.toLocaleDateString(undefined, { month: "short" }),
    day: date.toLocaleDateString(undefined, { day: "numeric" }),
  };
}

export function ParticipantSessionCard({
  session,
  responding,
  message,
  onRespond,
}: {
  session: ParticipantSessionView;
  responding: boolean;
  message: string | null;
  onRespond: (response: SessionRsvpResponse) => void;
}) {
  const date = dateParts(session.meetingDate);
  return (
    <article className={styles.participantSessionCard}>
      <div className={`${styles.dateTile} ${session.timing === "past" ? styles.pastDate : ""}`}>
        <strong>{date.month}</strong><span>{date.day}</span>
      </div>
      <div className={styles.sessionCardBody}>
        <div className={styles.sessionCardHeading}>
          <div>
            <span className={session.timing === "past" ? styles.completedPill : styles.statusPill}>{session.status}</span>
            <h3>{session.partnerName}</h3>
            <p>{session.topic || "Mentorship session"}</p>
          </div>
          <div className={styles.sessionWhen}>
            <strong><Clock3 size={14} />{session.startsAt.slice(0, 5)}–{session.endsAt.slice(0, 5)}</strong>
            <span>{session.format === "in_person" ? "In-Person" : session.format === "remote" ? "Remote" : session.format === "hybrid" ? "Either" : session.format || "Details pending"}</span>
          </div>
        </div>
        <div className={styles.rsvpArea}>
          <div>
            <span className={styles.rsvpLabel}>Your RSVP</span>
            {session.rsvpOpen ? (
              <div className={styles.rsvpButtons}>
                <button type="button" aria-pressed={session.ownRsvp === "attending"} disabled={responding} onClick={() => onRespond("attending")}><Check size={15} />Can attend</button>
                <button type="button" aria-pressed={session.ownRsvp === "not_attending"} disabled={responding} onClick={() => onRespond("not_attending")}><X size={15} />Can’t attend</button>
              </div>
            ) : <strong className={styles.readOnlyRsvp}>{sessionRsvpLabel(session.ownRsvp)} · RSVP closed</strong>}
            {responding && <small role="status">Saving response…</small>}
            {message && <small role="status" className={styles.rsvpMessage}>{message}</small>}
          </div>
          <div className={styles.attendeeRoster}>
            <span className={styles.rsvpLabel}><UsersRound size={14} />Participants</span>
            {session.attendees.map((attendee) => (
              <div key={attendee.semesterMembershipId}>
                <span><strong>{attendee.fullName}</strong><small>{attendee.role}</small></span>
                <em data-response={attendee.response}>{sessionRsvpLabel(attendee.response)}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
