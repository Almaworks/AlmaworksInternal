"use client";

import styles from "../outreach-workspace.module.css";
export type ImportDecision = "create" | "merge" | "exclude";
export function MatchResolution({ id, name, issue, decision, onDecision }: { id: string; name: string; issue: string; decision: ImportDecision; onDecision: (value: ImportDecision) => void }) { return <div className={styles.resolution}><div><strong>{name}</strong><p>{issue}</p></div><fieldset><legend className={styles.srOnly}>Resolve {name}</legend>{(["create", "merge", "exclude"] as const).map((value) => <label key={value}><input type="radio" name={`import-row-${id}`} checked={decision === value} onChange={() => onDecision(value)} />{value === "create" ? "Create new" : value[0].toUpperCase() + value.slice(1)}</label>)}</fieldset></div>; }
