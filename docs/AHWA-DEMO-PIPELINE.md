# Ahwa Demo Pipeline

This change turns `/pipeline` into an Ahwa-specific closing workflow instead of a generic CRM board.

## Added backend routes

```txt
GET  /api/demo-pipeline/overview
POST /api/demo-pipeline/schedule-demo
POST /api/demo-pipeline/mark-demo-done
POST /api/demo-pipeline/offer-trial
POST /api/demo-pipeline/mark-won
POST /api/demo-pipeline/mark-lost
```

## Behavior

The UI remains static Next.js on Cloudflare Pages. All commercial workflow decisions run in Cloudflare Pages Functions through `packages/backend`.

The backend updates existing tables only:

```txt
Contact
Task
Deal
Note
Activity
AuditLog
```

No new database migrations are required.

## Pipeline stages

Ahwa commercial stages are inferred from existing CRM data:

```txt
READY_TO_CALL    -> contact is a cafe/prospecting lead and not yet qualified
CALLED           -> contact stage INTERESTED
INTERESTED       -> contact stage POTENTIAL
DEMO_SCHEDULED   -> contact stage VISIT with pending MEETING task
DEMO_DONE        -> contact stage VISIT with demo-done tag
TRIAL_OFFERED    -> contact stage FREE_TRIAL
WON              -> contact stage CLIENT
LOST             -> contact stage LOST
```

## Actions

### Schedule demo

Creates a meeting task, moves the contact to `VISIT`, tags it as `demo-scheduled`, and ensures an open deal exists.

### Mark demo done

Completes pending meeting tasks, records demo notes, creates the next follow-up, and updates/creates the deal.

### Offer trial

Moves the contact to `FREE_TRIAL`, tags it as `trial-offered`, creates a trial follow-up task, and updates the deal to negotiation.

### Mark won

Moves the contact to `CLIENT`, marks the deal as `WON`, cancels pending touch tasks, records an activity, and writes an audit log.

### Mark lost

Moves the contact to `LOST`, stores the loss reason, marks an open deal as `LOST`, cancels pending touch tasks, and writes an audit log.

## UI

`/pipeline` now includes:

```txt
Ahwa-specific commercial board
Lead operating panel
Book demo form
Demo done form
Trial offer form
Won/lost forms
Demo checklist
Focus list
```

## Deployment

Run:

```bash
npm run cf:build
git add .
git commit -m "Add Ahwa demo pipeline"
git push
```

Then verify:

```txt
/api/demo-pipeline/overview
/pipeline
```
