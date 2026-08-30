# Mentor Needs preview design

## Scope

This document defines a frontend-only, fictional-data preview at `/design-preview/mentor-needs`. It does not read or write Supabase data, call APIs, change production routes, or create schema requirements.

## Startup request

The startup view presents one primary mentor need, with one optional secondary need. A type-ahead list offers canonical categories. If the desired term is absent, the typed value is immediately selectable as a custom category; no approval or backend write is implied. A mutually exclusive “I don't have a preference yet” path clears selected needs and permits saving. A free-form context field explains the decision or milestone behind the request.

Buttons update only React local state and provide an explicit preview-only confirmation.

## Outreach needs board

The Outreach view groups fictional categories and places three decision inputs side by side: active startup requests, active mentors, and manually tagged active Outreach contacts. The category row exposes a qualitative status and can expand to show roster-level fictional names and the recruiting note. A category with requests but no active mentor is a priority gap.

The board begins in a selected active cohort. Choosing `All time` requires a confirmation dialog; after confirmation, an inline warning explains that historic demand is for trend review rather than current recruiting action.

## Interaction and accessibility

- Native input, textarea, checkbox, button, and select controls provide keyboard operation.
- The suggestion list uses listbox/option semantics and the category toggle exposes `aria-expanded`.
- The all-time dialog has dialog and modal semantics.
- The layout becomes single-column on narrow screens; summary cards remain in a two-column grid.

## Validation

Run focused ESLint, TypeScript no-emit checking, and render the local preview route. Verify desktop and narrow browser layouts and the key interaction states: selecting a canonical need, creating a custom need, no-preference, category expansion, and all-time warning.
