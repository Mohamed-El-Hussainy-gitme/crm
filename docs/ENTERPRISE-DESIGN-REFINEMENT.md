# Enterprise design refinement

This pass replaces the earlier token-only skin with a stronger enterprise layout implementation.

## What changed

- Rebuilt the app shell around a persistent enterprise sidebar on tablet/desktop.
- Added a darker control-plane header and denser operational navigation.
- Reworked page headers into high-contrast workbench panels.
- Reworked stat cards, cards, badges, and the contacts table for clearer hierarchy.
- Rebuilt the login screen into a two-panel enterprise authentication layout.
- Updated copy so the UI no longer references seeded/local accounts or older phase names.
- Kept the Cloudflare Pages + Functions + Supabase fullstack behavior unchanged.

## QA checklist

- `/login` renders a high-contrast two-panel enterprise page.
- `/today`, `/contacts`, `/companies`, `/tasks`, `/reports`, and `/settings` use the persistent sidebar on desktop/tablet.
- `/contacts` table header is dark, readable, and actions are visually consistent.
- `ADMIN` badge and language switch remain visible.
- Keyboard focus is visible on links, buttons, inputs, and selects.
- Network behavior remains unchanged: UI calls only same-origin `/api/*` routes.
