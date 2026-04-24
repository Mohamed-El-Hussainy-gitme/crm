# Hybrid CRM - Phase 1

## What was implemented

- Rebuilt the primary web shell into a calmer, lighter dashboard experience.
- Reduced the main navigation to:
  - Today
  - Contacts
  - Pipeline
  - Tasks
  - Messages
  - Reports
  - Settings
- Kept advanced routes available, but moved them out of the primary workflow.
- Redirected the old `/dashboard` entry to `/today`.
- Redirected login success to `/today`.
- Added a `/messages` alias that reuses the WhatsApp workspace.

## Core screens updated

- Login
- Today queue
- Contacts list
- Contact details (Contact 360)
- Pipeline
- Tasks
- Messages / WhatsApp workspace
- Reports
- Settings

## Design direction

- Light neutral background
- White cards with low visual noise
- Shorter navigation
- Action-first pages instead of analytics-first pages

## Notes

- Backend/domain modules were preserved.
- The work focused on the `apps/web` layer for the phase-1 hybrid CRM surface.
- Advanced tools are still accessible from Settings.
