# Handoff: Client Paid Media Dashboard (Share Portal Redesign)

## Overview

Redesign of the **public client portal** at `app/share/concepts/[projectId]/page.tsx` — the page where clients of Alpha Marino review their paid media creative assets and approve/request-changes on them, and see the strategy concepts behind each piece.

The goals of the redesign:

1. **Make review the primary action.** Put pending assets front-and-center with a KPI strip + persistent review banner + a pulsing counter.
2. **Never separate assets from their concept.** Assets always appear next to the strategy card that produced them — a sticky 2-column layout (concept on the left, pieces on the right).
3. **Ship a more polished visual language.** Slate neutrals, amber/emerald/sky/violet status tokens, small radii, subtle borders, tabular numerals for metrics.

## About the Design Files

The files in this bundle are **design references**, not production code:

- `Client Paid Media Dashboard.html` — HTML/React mock on a design canvas with 5 artboards (desktop + mobile, light + dark, with concept-open and feedback states). This is how the design should LOOK.
- `reference_code/app/share/concepts/[projectId]/page.tsx` — a **Next.js implementation** written against Alpha Marino's existing schema, imports, and conventions (Supabase admin client, `ClientAssetReview` component, `ANGLE_GUIDE` constants, etc.). This file is the intended production implementation — you should be able to drop it into the real repo at the same path, verify the `@/` imports resolve, and ship it.
- `reference_code/components/share/client-portal-shell.tsx` — a new client component (`"use client"`) that wraps the page with a sticky header, scroll progress bar, and footer. Drop it into `components/share/` in the real repo.

**Your task:** move these two `.tsx` files into the real Alpha Marino codebase, make sure the imports match what's actually there, and deploy. Only fall back to re-implementing from the HTML mock if the `.tsx` doesn't fit your repo.

## Fidelity

**High-fidelity.** All colors, spacing, typography, radii, and interactions are finalized in both the HTML mock and the `.tsx` files.

## Files Touched

In the target repo:

- **REPLACE** `app/share/concepts/[projectId]/page.tsx` with the version in `reference_code/app/share/concepts/[projectId]/page.tsx`
- **ADD** `components/share/client-portal-shell.tsx` from `reference_code/components/share/client-portal-shell.tsx`

Nothing else changes. The existing components are reused as-is:

- `@/lib/supabase/admin` — `createAdminClient()`
- `@/lib/constants/creatives` — `ANGLE_GUIDE`
- `@/components/share/client-asset-review` — `ClientAssetReview` (exact same props shape as before)

Queries are the same three parallel Supabase calls as the previous implementation, with one addition: `concept_id` is now included in the `creative_assets` projection so assets can be grouped by concept.

## Screens / Views

### 1. Landing state — client has assets to review (primary case)

**Header (sticky, `ClientPortalShell`)**
- White/85% backdrop-blur, 56px tall, `border-b border-slate-200/70`
- Left: 28×28 slate-900 rounded-lg badge with white "A", then "Alpha Marino" (14px, font-semibold)
- On scroll > 80px: condenses — project name appears inline after a middot
- Right (when not condensed): `<client company> — Portal del cliente` (12px, slate-500)
- Scroll progress bar directly under header: 2px tall, `bg-slate-900`, width animates via inline `style={{ width: progress% }}`

**Hero section** (max-w-6xl, px-8, py-12)
- Eyebrow (uppercase, tracking-[0.18em], 11px, slate-500): `Alpha Marino × <client name>`
- H1 (28–36px, font-bold, tracking-tight, leading-[1.1], slate-900): project name
- **4 KPI cards** in a grid (2 cols mobile / 4 cols desktop), gap-3:
  - Each card: white bg, `border-slate-200/70`, rounded-xl, px-4 py-3, subtle shadow `0_1px_2px_rgba(15,23,42,0.04)`
  - Inside: 1.5px dot (color by tone) + 10px uppercase label (tracking-wider, slate-500), then 2xl font-bold tabular-nums value in the tone color
  - Tones: **amber** (Por revisar), **emerald** (Aprobados), **sky** (Cambios solicitados), **violet** (Progreso %)

**Review banner** (amber variant, shown whenever there are pending)
- Max-w-6xl container, `rounded-xl border-amber-200/80`, bg gradient `from-amber-50 to-amber-50/30`
- Left: 32×32 rounded-full amber-100 with a `text-amber-700` count in bold tabular-nums, AND an `animate-ping` amber-400/40 ring behind it
- Middle: bold amber-900 title (`N piezas esperan tu revisión`) + amber-800/75 subtitle
- Right (hidden on mobile): "Ir a revisar →" pill — white/70 bg, amber ring, hover:white, links to `#first-pending`
- **Emerald variant** when `allReviewed`: checkmark icon, "Revisión completada" + gratitude subtitle

**Concepts + Assets section**
- Section header pattern (reused everywhere):
  - `w-1 h-10` gradient bar (slate-300 to slate-200) + content column
  - Eyebrow: 10px uppercase tracking-[0.16em] slate-500
  - Title: 20–24px font-bold tracking-tight slate-900
  - Subtitle (optional): 14px slate-500 max-w-2xl leading-relaxed
- Each concept renders as a `ConceptGroup`:
  - Desktop: `grid-cols-[340px_1fr]` — strategy card sticky on left (`lg:sticky lg:top-20`), assets on right
  - Mobile: stacks vertically
  - Strategy card:
    - White bg, rounded-2xl, `border-slate-200/80`, subtle shadow
    - Top section (border-b): angle badge (slate-900 bg, white text, rounded-md, emoji + angle name, 11px font-semibold) + funnel pill (semantic color ring — sky/violet/emerald) + optional "⭐ Validado" amber pill
    - Title (18px font-bold tracking-tight)
    - Body (px-5 py-4 space-y-4): field rows with 10px uppercase label (dot color-coded — rose for Problema, emerald for Transformación, slate default), and 13px slate-700 value text leading-relaxed
    - Footer (slate-50/70 bg, border-t): `N piezas · N pendientes · N aprobados · N cambios` with color-coded dots (1.5×1.5px)
  - Assets column: existing `<ClientAssetReview>` components, space-y-4; first one gets `id="first-pending"` if there are pendings
- Concepts are sorted so those with more pending assets appear first
- Unlinked assets render as a group with a "Piezas sueltas" placeholder card

**Strategy-only concepts section** (only if there are concepts with no assets)
- On a slate-50/40 tinted background with a top border
- Grid of `StrategyConceptCard`s: 1 col mobile / 2 col sm / 3 col lg
- Same visual language as the sticky strategy card (angle badge, funnel pill, Evergreen star, field rows with dots)

### 2. Empty state
- Centered 56×56 slate-100 rounded-2xl icon + slate-500 text "Sin contenido disponible por el momento."

### 3. Footer
- White bg, `border-t border-slate-200/70`, mt-12
- Flex row (stacks on mobile): support email mailto on the left, `© <year> Alpha Marino` on the right
- 12px slate-500, underline-offset on the link, hover → slate-900

## Interactions & Behavior

- **Scroll progress bar** — updates on every `scroll` event, smooth 75ms transition on width. Listener uses `{ passive: true }`; cleaned up on unmount.
- **Header condense** — at scroll > 80px, swap the "Portal del cliente" subtitle for the project name inline next to the brand.
- **"Ir a revisar" button** — anchor to `#first-pending` (the first asset in the first pending concept). Standard browser anchor scroll; no JS needed.
- **Pulsing review counter** — `animate-ping` Tailwind class on an absolute amber-400/40 ring inside the count badge. Infinite.
- **Existing review flow** unchanged — `ClientAssetReview` handles approve/request-changes and posts to the same server action. Do not re-implement.
- **Sticky strategy card** — `lg:sticky lg:top-20` so the concept context stays visible while scrolling through its assets. Only applied at `lg` breakpoint; on mobile the card sits above its assets.

## State Management

- Shell's scroll state is local to `ClientPortalShell` (`useState` + `useEffect` on `scroll`). No global store.
- Page itself is a **server component** — all data fetched in the async function body via `createAdminClient()`. No client-side fetching.
- No new mutations.

## Data Requirements

Queries (already in the existing page):

1. `projects` → `name, customer:customers(name, company)` filtered by `id = projectId`
2. `creative_concepts` → `id, name, angle_type, target_persona, product_service, pain_point, why_it_works, transformation, funnel_stage, status` where `project_id = projectId AND status IN ("Active", "Evergreen")`, ordered by status DESC then created_at DESC
3. `creative_assets` → all fields needed for `ClientAssetReview` **PLUS `concept_id`** (this is the addition), joined with concept name + angle_type, where `project_id = projectId AND client_visible = true`, ordered by created_at DESC

After fetching, page does these derivations in-memory:
- `pendingCount / approvedCount / changesCount / reviewedPct` for the KPI strip
- `assetsByConcept` — `Map<concept_id|null, Asset[]>`
- `conceptsPendingFirst` — concepts with ≥1 asset, sorted by pending desc
- `strategyOnlyConcepts` — concepts with 0 assets

## Design Tokens

### Colors

Uses Tailwind's default slate + semantic tones. Exact palette:

| Token | Hex | Usage |
|---|---|---|
| `slate-900` | `#0f172a` | Body text, headers, angle badge bg, progress bar |
| `slate-700` | `#334155` | Strategy field values |
| `slate-600` | `#475569` | Subtitles |
| `slate-500` | `#64748b` | Muted text, eyebrows |
| `slate-300` | `#cbd5e1` | Default field dots |
| `slate-200` | `#e2e8f0` | Borders |
| `slate-100` | `#f1f5f9` | Hover/tinted surfaces |
| `slate-50` | `#f8fafc` | Footer bg of strategy card (used @ /70 alpha) |
| bg base | `#f5f6fa` | Page background |
| `amber-400/700/900` | | Pending review (dot / text / title) |
| `emerald-400/700/900` | | Approved state + transformation accent |
| `sky-400/700` | | Changes requested + TOF funnel |
| `violet-400/700` | | Progress KPI + MOF funnel |
| `rose-400` | `#fb7185` | Pain point accent dot |

### Spacing
- Page max width: `max-w-6xl` (1152px)
- Page padding: `px-4 sm:px-8`
- Section gaps: `space-y-10` between concept groups, `space-y-4` between assets
- Strategy card column width (desktop): `340px` fixed, gap-8 to assets

### Typography
- Default `font-sans` (Inter or whatever is already set). No new font imports.
- Hero H1: 28px → 36px at sm, font-bold, tracking-tight, leading-[1.1]
- Section titles: 20 → 24px, font-bold, tracking-tight
- Eyebrows: 10–11px, font-semibold, `uppercase tracking-[0.16em]` (or `tracking-[0.18em]` for hero)
- Body: 13–14px, leading-relaxed
- KPI values: 2xl (24px), font-bold, tabular-nums, tracking-tight

### Radii
- Cards: `rounded-2xl` (16px)
- KPI / banner / pills: `rounded-xl` (12px) or `rounded-lg` (8px)
- Angle badge: `rounded-md` (6px)
- Brand mark: `rounded-lg` (8px)

### Shadows
- Card subtle: `shadow-[0_1px_2px_rgba(15,23,42,0.04)]`
- Card hover: `hover:shadow-md`

## Assets

No new images or icons beyond existing `lucide-react` usage. The "A" brand mark is text on a slate-900 box — replace with the real Alpha Marino logo component if you have one.

## Implementation Checklist

1. Copy `reference_code/components/share/client-portal-shell.tsx` → `components/share/client-portal-shell.tsx`
2. Copy `reference_code/app/share/concepts/[projectId]/page.tsx` → `app/share/concepts/[projectId]/page.tsx` (overwrite)
3. Verify imports resolve:
   - `@/lib/supabase/admin` ✓ (existed)
   - `@/lib/constants/creatives` ✓ (existed)
   - `@/components/share/client-asset-review` ✓ (existed — props unchanged)
   - `@/components/share/client-portal-shell` ← **new**
4. Run `pnpm typecheck` / `pnpm build` to confirm no regressions
5. Test locally against a project with: (a) pending assets, (b) all-reviewed assets, (c) concepts without assets, (d) assets without concepts
6. Ship.

## Files in This Bundle

- `README.md` — this file
- `Client Paid Media Dashboard.html` — visual reference (5 artboards on a design canvas)
- `reference_code/app/share/concepts/[projectId]/page.tsx` — drop-in page replacement
- `reference_code/components/share/client-portal-shell.tsx` — new client shell component
