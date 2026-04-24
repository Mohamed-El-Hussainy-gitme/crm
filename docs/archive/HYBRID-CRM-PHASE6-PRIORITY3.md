# Hybrid CRM — Phase 6 Priority 3

This pass hardens workflow correctness and business-rule enforcement.

## Delivered

### 1) Contact identity correctness
- Added normalized phone/email duplicate detection on contact create and update.
- Prevents creating multiple contacts for the same real-world phone/email when formatting differs.
- WhatsApp webhook lookup now matches by normalized phone instead of raw exact string only.

### 2) Stage transition rules
- Moving a contact to `INTERESTED`, `POTENTIAL`, or `ON_HOLD` now requires an explicit next action.
- Moving a contact to `CLIENT` now requires either:
  - a won deal with positive amount, or
  - at least one scheduled payment.
- Moving a contact to `LOST` clears `nextFollowUpAt` and cancels pending follow-up tasks.
- Bulk stage changes now return partial success with `rejected` items instead of silently forcing invalid transitions.

### 3) Deal workflow rules
- `PROPOSAL`, `NEGOTIATION`, and `WON` now require a positive amount.
- `WON` now requires at least one scheduled payment for the linked contact.
- Winning a deal promotes the contact to `CLIENT`.
- Creating proposal/negotiation deals upgrades early-stage contacts to `POTENTIAL`.

### 4) Follow-up and task consistency
- `nextFollowUpAt` is now synchronized from the earliest pending `FOLLOW_UP` task.
- Completing a follow-up/call/meeting updates `lastContactedAt`.
- Rescheduling or cancelling follow-up tasks recalculates the contact’s next follow-up date.

### 5) Payment workflow correctness
- New payments created with past due dates are stored as `OVERDUE` immediately.
- Marking a payment as paid promotes the contact to `CLIENT`.

## Primary files changed
- `apps/api/src/lib/workflow.ts`
- `apps/api/src/modules/contacts/routes.ts`
- `apps/api/src/modules/tasks/routes.ts`
- `apps/api/src/modules/followups/routes.ts`
- `apps/api/src/modules/deals/routes.ts`
- `apps/api/src/modules/payments/routes.ts`
- `apps/api/src/modules/whatsapp/routes.ts`

## Notes
- This pass focuses on correctness at API boundaries and workflow transitions.
- It intentionally does not introduce UI simplification, observability, or E2E test expansion; those belong to later priorities.
