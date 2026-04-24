# Enterprise design system migration

This pass applies the uploaded `enterprise-SKILL.md` direction to the Cloudflare-ready CRM UI.

## Design intent

The interface should feel like a clean, high-contrast enterprise application for data-heavy workflows: structured, readable, keyboard-friendly, and visually consistent across dashboard, tables, forms, drawers, authentication, and navigation.

## Implemented foundations

- Added Enterprise semantic tokens to `apps/web/tailwind.config.ts`:
  - `enterprise.primary` = `#072C2C`
  - `enterprise.secondary` = `#FF5F03`
  - `enterprise.success` = `#16A34A`
  - `enterprise.warning` = `#D97706`
  - `enterprise.danger` = `#DC2626`
  - `enterprise.surface` = `#EDEADE`
  - `enterprise.text` = `#111827`
- Updated `apps/web/app/globals.css` with CSS variables, high-contrast focus states, typography defaults, selection styles, grid background, and a compatibility bridge for existing Tailwind-heavy pages.
- Added font stacks for Ubuntu, Oswald, and Ubuntu Mono with safe fallbacks.
- Tightened excessive soft rounding into enterprise-radius defaults.

## Component migration

Updated shared primitives:

- `apps/web/components/ui.tsx`
  - Buttons
  - Inputs/selects/textareas
  - Checkbox cards
  - Drawers
  - Info tiles
  - List rows
  - Mobile action bar
- `apps/web/components/cards.tsx`
  - Page headers
  - Cards
  - Stat cards
  - Badges
  - Empty states
- `apps/web/components/layout.tsx`
  - High-contrast primary sidebar
  - Enterprise top bar
  - Explicit active navigation state
  - Improved session card and mobile navigation
- `apps/web/components/tables.tsx`
  - Tokenized contacts table and row actions
- `apps/web/app/login/page.tsx`
  - Enterprise authentication screen
  - Removed misleading seeded credentials defaults

## Accessibility behavior

- Focus states use visible orange outlines with offset.
- Interactive controls keep a minimum height of 44px where practical.
- Labels and button text remain explicit.
- Error states use semantic danger tokens with high-contrast text.
- Navigation active state is visually distinct by both color and filled shape.

## Migration notes

Many page files still contain older Tailwind utility classes. The compatibility bridge in `globals.css` remaps the dominant `slate`, `sky`, `emerald`, `amber`, and `rose` utilities into Enterprise tokens so the full app adopts the design system without rewriting every screen at once.

Future page-level cleanup should replace local raw utilities with shared components from `components/ui.tsx`, `components/cards.tsx`, and `components/tables.tsx`.

## QA checklist

- `npm run cf:build` completes successfully.
- `/login` has no pre-filled legacy seed credentials.
- `/today`, `/contacts`, `/companies`, `/tasks`, `/reports`, and `/settings` use the Enterprise primary/surface palette.
- Keyboard tabbing shows an obvious orange focus ring.
- Sidebar active state is visible at 100% zoom and 200% zoom.
- Buttons have visible default, hover, focus-visible, disabled, and loading states where applicable.
- Error messages are not low-contrast.
- RTL layout still preserves sidebar/drawer border direction.
