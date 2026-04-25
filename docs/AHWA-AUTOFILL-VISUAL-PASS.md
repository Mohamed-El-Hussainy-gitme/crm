# Ahwa CRM Autofill and Visual Pass

## What changed

This pass fixes two production pain points:

1. Google Maps autofill was treating short-link path fragments as cafe names and often filled nothing useful.
2. The pipeline page was visually crowded and inconsistent with the Enterprise CRM direction.

## Autofill behavior

The backend now uses a dedicated Google Maps intake parser:

- Resolves Google Maps short links when possible.
- Reads the final URL and page metadata server-side.
- Extracts cafe name, phone, address, area, map URL, and confidence.
- Avoids using random short-link codes as names.
- Warns clearly when Google does not expose phone/address from the pasted link.
- Allows creating a `needs-phone` lead when no phone is detected instead of blocking the workflow.

Best input remains one of these:

```text
Cafe name
Phone number
Address / area
Google Maps URL
```

or a Google Maps place link. Short links are resolved best-effort; if Google does not expose phone in the page response, paste the copied place details with the link.

## Pipeline visual change

`/pipeline` is no longer a crowded multi-column board. It now works as:

- Stage selector cards with counts.
- Focused lead list for one selected stage.
- Sticky action panel for the selected cafe.
- Demo checklist below the active work area.
- Focus list for high-priority commercial moves.

This keeps the sales flow operational instead of visually cramped.

## Files changed

```text
packages/backend/src/acquisition/maps-intake.ts
packages/backend/src/acquisition/routes.ts
packages/backend/src/contacts/service.ts
apps/web/components/contact-editor.tsx
apps/web/app/pipeline/page.tsx
apps/web/components/cards.tsx
apps/web/app/globals.css
```
