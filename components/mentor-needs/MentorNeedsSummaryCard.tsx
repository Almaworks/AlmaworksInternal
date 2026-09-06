import { CheckCircle2, ChevronRight, CircleHelp } from "lucide-react";

import type { ParticipantMentorNeedsSummary } from "@/src/dashboard/participant-dashboard";
import styles from "@/app/design-preview/participant-dashboard/participant-dashboard.module.css";

export function MentorNeedsSummaryCard({ summary, onEdit }: { summary: ParticipantMentorNeedsSummary; onEdit: () => void }) {
  const complete = summary.noPreference || summary.needs.length > 0;
  return (
    <section className={styles.mentorNeedsSummary} aria-labelledby="mentor-needs-summary-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Matching preferences</p>
          <h2 id="mentor-needs-summary-title">Mentor needs</h2>
        </div>
        <span className={complete ? styles.needsComplete : styles.needsIncomplete}>
          {complete ? <CheckCircle2 size={14} /> : <CircleHelp size={14} />}
          {complete ? "Ready" : "Needs setup"}
        </span>
      </div>
      {summary.noPreference ? (
        <p className={styles.summary}>No preference yet — Almaworks can recommend a mentor using your context.</p>
      ) : summary.needs.length > 0 ? (
        <div className={styles.needsChips}>{summary.needs.map((need, index) => <span key={need}>{index === 0 ? "Primary" : "Secondary"} · {need}</span>)}</div>
      ) : (
        <p className={styles.summary}>Choose the expertise that would move your startup forward this semester.</p>
      )}
      {summary.context && <p className={styles.needsContext}>{summary.context}</p>}
      <button type="button" onClick={onEdit} className={styles.cardAction}>Edit mentor needs <ChevronRight size={14} /></button>
    </section>
  );
}
