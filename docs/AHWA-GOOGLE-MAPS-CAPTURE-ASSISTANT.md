# Ahwa Google Maps Capture Assistant

This pass converts prospecting from paste-only intake into a browser-assisted capture workflow.

## What changed

### Backend

Added:

- `packages/backend/src/acquisition/capture-assistant.ts`
- `POST /api/acquisition/capture`

The new capture endpoint accepts a payload captured from an open Google Maps place page and returns a reviewed lead candidate with:

- cafe name
- phone number when visible
- address
- inferred area
- Google Maps URL
- website when visible
- score and confidence
- warnings
- duplicate candidates

The endpoint compares the captured lead against existing contacts using:

- normalized phone
- Google Maps URL
- cafe name similarity + area

### Frontend

Updated:

- `apps/web/app/prospecting/page.tsx`

Added a new `Capture` tab inside `/prospecting` with:

- draggable `Save to CRM` bookmarklet
- manual fallback textarea
- capture review queue
- duplicate warnings
- editable fields before import

## User workflow

1. Open Google Maps.
2. Search for cafes in a target area.
3. Open a cafe place profile.
4. Click the `Save to CRM` bookmarklet.
5. CRM opens `/prospecting?capture=...` with the place payload.
6. Review warnings and duplicates.
7. Import the selected lead.
8. The imported cafe enters the call queue.

## Limitations

This does not use Google Places API. It extracts only what is visible in the browser DOM. If Google does not display a phone number on the place page, the lead is still captured as `needs-phone` for enrichment.

## Smoke test

After deploy:

1. Open `/prospecting`.
2. Open the `Capture` tab.
3. Drag `Save to CRM` to the bookmarks bar.
4. Open a Google Maps cafe page.
5. Click the bookmarklet.
6. Confirm that `/prospecting` opens with a candidate in the review queue.
7. Import selected.
8. Confirm the lead appears in `/contacts` and the prospecting call queue.
