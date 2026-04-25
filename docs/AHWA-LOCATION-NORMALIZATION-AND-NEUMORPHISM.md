# Ahwa Location Normalization + Neumorphism UI Pass

## Purpose

This pass fixes the Google Maps autofill location model and makes the UI follow the uploaded `neumorphism` design-system source of truth.

## Location normalization

The intake pipeline now separates:

- `locationText`: readable street address only.
- `area`: district / territory such as `الدقي`, `مدينة نصر`, `المعادي`.
- `city`: detected city such as `القاهرة` or `الجيزة`.
- `mapUrl`: Google Maps URL only.
- `coordinates`: latitude/longitude display value.
- `plusCode`: Google plus code when detected.

Coordinates, plus codes, and URLs are no longer stored as the readable address.

## Updated backend files

- `packages/backend/src/acquisition/location-normalizer.ts`
- `packages/backend/src/acquisition/maps-intake.ts`
- `packages/backend/src/acquisition/capture-assistant.ts`
- `packages/backend/src/acquisition/routes.ts`
- `packages/shared/src/index.ts`

## Updated frontend files

- `apps/web/app/prospecting/page.tsx`
- `apps/web/components/contact-editor.tsx`
- `apps/web/app/globals.css`
- `apps/web/tailwind.config.ts`
- `apps/web/components/ui.tsx`
- `apps/web/components/cards.tsx`
- `apps/web/components/layout.tsx`

## Visual system

The UI now uses the neumorphism skill tokens:

- Primary: `#006666`
- Secondary: `#F1F2F5`
- Success: `#00A63D`
- Warning: `#FE9900`
- Danger: `#FF2157`
- Surface: `#E7E5E4`
- Text: `#1E2938`
- Fonts: Space Mono + JetBrains Mono
- Compact density
- Soft raised/inset shadows

## Validation checklist

1. Paste a Google Maps place link in contact autofill.
2. Confirm the cafe name and phone are filled.
3. Confirm coordinates do not appear in the address field.
4. Confirm the address is a readable street/address only when available.
5. Confirm area is detected as district, not URL or coordinates.
6. Open `/prospecting` capture and intake tabs.
7. Confirm review cards show area, city, readable address, coordinates, and Maps URL separately.
8. Run `npm run cf:build` before deployment.
