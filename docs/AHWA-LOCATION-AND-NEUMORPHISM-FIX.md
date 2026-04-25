# Ahwa Location Normalization and Neumorphism UI Fix

## What changed

- Added stronger location cleanup so Google scripts, coordinates, links, and plus codes do not become readable addresses.
- Kept coordinates separate from the address field.
- Kept Google Maps URL separate from the address field.
- Reworked the visual shell to follow the uploaded neumorphism design direction: soft raised panels, inset fields, monochromatic surface, compact spacing, and primary teal action emphasis.
- Removed user-facing technical copy such as backend/cloud-provider/database implementation language.
- Reworked prospecting copy into practical Arabic workflow language.
- Calmed the pipeline/login/shell visual hierarchy and removed the previous dark enterprise block style.

## Manual verification

After deployment, test:

1. `/contacts` -> Add contact -> paste a short Google Maps URL -> Autofill.
2. Confirm `Readable address` does not contain JavaScript, coordinates, or URLs.
3. Confirm coordinates appear only in the coordinates row.
4. Confirm `/prospecting` uses Arabic workflow wording.
5. Confirm `/pipeline` is calmer and no longer uses the crowded kanban-like visual style.
