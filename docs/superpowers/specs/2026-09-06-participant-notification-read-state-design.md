# Participant notification read state

## Purpose

Make the participant sidebar badge represent the number of unread dashboard notifications. A participant can open an individual notification, which records it as read and routes the participant to the related session or setup task.

## Scope

This change applies to the derived activation and session notifications already shown on the participant dashboard. It does not introduce a separate message inbox, notification-delivery pipeline, or duplicate notification-content table.

## Data model

Add one program-scoped table, `participant_notification_reads`:

- `profile_id` references the durable participant profile.
- `semester_id` is non-null and references the associated cohort term.
- `notification_key` is a stable derived-notification identity.
- `read_at` records the first time the participant opened the item.
- The composite primary key is `(profile_id, semester_id, notification_key)`.

The dashboard continues to derive notification title, body, destination, and timestamp from existing activation state and sessions. Read receipts only decorate those derived rows. Session keys include the session lifecycle state so a later completed-session notice remains unread after an earlier confirmed-session notice was opened. Activation keys include the current activation-step identifier.

## Authorization

Enable RLS on the receipt table. An authenticated participant may select and insert only rows whose `profile_id` is their own canonical profile and whose `semester_id` matches one of their memberships. Participants cannot alter another profile's receipt or write receipts for a semester they do not belong to. There is no service-role access in the participant path.

## API and dashboard flow

1. The participant dashboard loader reads the participant's existing receipts for the active semester through the authenticated RLS client.
2. It assigns `read` and `destination` fields to each derived notification before returning the dashboard view.
3. The sidebar badge uses the unread count, not the total number of notifications.
4. Selecting a notification immediately marks it read in local UI state, persists an idempotent receipt, and opens the related tab:
   - session notifications open Sessions;
   - activation notifications open the relevant setup tab.
5. If persistence fails, the UI restores the unread state and shows a concise error. Existing receipts remain authoritative after refresh.

## UI

Notification rows on Home and Notifications become accessible buttons. Unread rows retain their visual emphasis; read rows remain visible but neutral. The notification screen adds no modal or second inbox: opening a notification takes the participant directly to its existing relevant workspace.

## Validation

Cover derived notification keys and unread counting with unit tests, API validation and ownership behavior with route tests, and RLS isolation with pgTAP. Verify desktop and narrow participant dashboards show a live-updating badge and maintain readable, clickable notification rows.
