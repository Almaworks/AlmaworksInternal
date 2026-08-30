"use client";

import styles from "../outreach-workspace.module.css";
export function ImportSummary({ values }: { values: { create: number; merge: number; exclude: number; issues: number } }) { return <div className={styles.importSummary}><div><span>Create</span><strong>{values.create}</strong></div><div><span>Exact / merge</span><strong>{values.merge}</strong></div><div><span>Exclude</span><strong>{values.exclude}</strong></div><div className={values.issues ? styles.summaryIssue : ""}><span>Needs review</span><strong>{values.issues}</strong></div></div>; }
