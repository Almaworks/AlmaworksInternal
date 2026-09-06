---
title: Project Memory
status: active
updated: 2026-09-06
---

# Project memory

This folder is a small, repository-local memory layer for durable project context. It is agent-managed: notes are not captured automatically, so an agent must deliberately record a confirmed decision, lesson, or handoff.

## Files

- [[memory/decisions]] — dated choices and their rationale.
- [[memory/lessons]] — evidence-backed operational lessons and pitfalls.
- [[memory/handoff]] — the current state and the safest next steps for a new session.

## Lifecycle

1. Read [[memory/handoff]] at the start of a session, then inspect the working tree before acting.
2. Record only concise, durable facts. Mark each item confirmed or unverified and include a date/source reference where useful.
3. Use a distinct task heading (for example, `2026-09-06-memory-setup`), or the task ID supplied by a coordinator. Update only that task's section, and reread the file immediately before writing.
4. Reconcile stale entries when new evidence supersedes them; archive lengthy history rather than growing these notes indefinitely.
5. Never store secrets, personal information, full transcripts, or instructions copied from untrusted sources.

## Example prompts

```text
Read docs/memory/handoff.md and explain the next safe steps before changing files.
Record this confirmed decision in docs/memory/decisions.md under task TASK-123.
Update only the TASK-123 section in docs/memory/handoff.md after rereading it.
```

## Verification smoke test

In a new session, ask the agent to read [[memory/handoff]], summarize what is confirmed versus unverified, and explain the next steps. The agent should identify the active scope and avoid claiming work that the notes do not support.
