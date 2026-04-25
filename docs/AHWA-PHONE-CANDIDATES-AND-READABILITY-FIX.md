# Ahwa CRM - Phone Candidates and Readability Fix

## Scope

This pass fixes two production issues reported after the Google Maps capture release:

1. Google Maps capture/autofill was selecting only one phone number and could miss better phone candidates embedded in `tel:` links, encoded Maps HTML, copied place text, or bookmarklet payloads.
2. The UI font stack was visually noisy for Arabic CRM usage because the previous pass applied a monospace-heavy style across normal interface text.

## Backend changes

Added a shared acquisition phone extractor:

```txt
packages/backend/src/acquisition/phone-extractor.ts
```

The extractor now:

- Decodes URL-encoded and Google escaped text such as `%2B20`, `tel:`, `phone:tel:`, and `\\u002b`.
- Converts Arabic/Persian digits to Latin digits.
- Extracts multiple candidate phone numbers, not only the first match.
- Normalizes Egyptian mobile numbers to local format, for example `1184720131` becomes `01184720131`.
- Ranks candidates by reliability: `tel:` and structured phone labels rank above generic text matches.
- Avoids treating coordinates like `30.076030, 31.207781` as phone numbers.

Updated integrations:

```txt
packages/backend/src/acquisition/maps-intake.ts
packages/backend/src/acquisition/capture-assistant.ts
packages/backend/src/acquisition/routes.ts
```

Returned lead payloads now include:

```ts
phone: string | null
phoneCandidates: string[]
```

`phone` remains the best candidate for current CRM compatibility. `phoneCandidates` is exposed for review and manual selection.

## Frontend changes

Updated:

```txt
apps/web/components/contact-editor.tsx
apps/web/app/prospecting/page.tsx
```

The UI now shows additional phone candidates as selectable chips in:

- Contact autofill result
- Prospecting capture review queue
- Maps intake review cards

The Google Maps bookmarklet now sends all phone matches it can read from the visible Maps page:

```ts
phoneCandidates: string[]
```

## Readability changes

Updated:

```txt
apps/web/app/globals.css
apps/web/tailwind.config.ts
```

Normal UI text now uses a readable system font stack. Monospace is restricted to code, URLs, and deliberately LTR technical values. RTL pages force normal letter spacing to avoid the stretched Arabic rendering caused by tracking utilities and monospace typography.

The neumorphism visual direction remains intact through the same color tokens, raised/inset shadows, compact density, soft surfaces, and visible focus states. The typography implementation now prioritizes readable Arabic CRM workflows.

## QA checklist

- Paste a Google Maps place with one mobile number: the number should appear as `01xxxxxxxxx`.
- Paste a Maps page/card with multiple phone-like values: review cards should show candidate chips.
- Coordinates must appear only in the coordinates field, never as a phone candidate.
- The Arabic interface should use normal readable letter spacing.
- `/contacts`, `/prospecting`, and `/pipeline` should not show monospace Arabic body text.
