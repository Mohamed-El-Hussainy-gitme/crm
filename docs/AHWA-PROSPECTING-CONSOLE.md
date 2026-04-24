# Ahwa Prospecting Console

## Purpose

This pass changes the CRM from a generic contact database into an Ahwa café acquisition console.

The workflow is now:

```txt
Google Maps text / links
  -> /prospecting
  -> Cloudflare backend parsing
  -> reviewed import queue
  -> Contact records tagged for Ahwa acquisition
  -> daily call queue
  -> call outcome buttons
  -> automatic stage/task/follow-up updates
```

## Added routes

### Frontend

```txt
/prospecting
```

### Backend

```txt
GET  /api/acquisition/overview
POST /api/acquisition/parse
POST /api/acquisition/import
POST /api/acquisition/call-outcome
GET  /api/acquisition/templates?contactId=<id>
```

## No paid APIs

The parser is heuristic and paste-based. It does not call Google Places, Maps, or paid APIs.

Supported input examples:

```txt
Cafe Name
01012345678
Coffee shop
90th Street, New Cairo, Cairo
https://www.google.com/maps/place/Cafe+Name
```

Multiple café cards can be pasted at once if separated by blank lines.

## Database behavior

No new required tables were added.

The implementation uses existing tables:

```txt
Contact
Task
CallLog
Note
Activity
```

Imported café leads are tagged with:

```txt
ahwa,cafe,prospecting,maps
```

Leads without phone numbers are still imported using a synthetic `NO-PHONE-*` marker and tagged:

```txt
needs-phone
```

This allows area coverage research without blocking the workflow.

## Call outcome automation

The call queue supports these outcomes:

```txt
NO_ANSWER          -> stays LEAD, creates retry call task tomorrow
INTERESTED         -> moves INTERESTED, creates WhatsApp follow-up
NEEDS_OWNER        -> moves POTENTIAL, creates owner call task
MEETING_BOOKED     -> moves VISIT, creates meeting task
REJECTED           -> moves LOST, cancels pending touch tasks
WRONG_NUMBER       -> moves LOST, tags wrong-number
ALREADY_HAS_SYSTEM -> moves ON_HOLD, creates later follow-up
NEEDS_CALLBACK     -> moves POTENTIAL, creates callback task
```

## Deployment

No new Cloudflare variables are required.

After pulling this version:

```bash
npm run cf:build
git add .
git commit -m "Add Ahwa prospecting console"
git push
```

Then open:

```txt
/prospecting
```
