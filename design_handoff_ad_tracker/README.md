# Handoff: Ad Tracker — Discovery + Clone Flow

## Overview

This handoff packages a high-fidelity prototype of an **Ad Tracker** product called *Vantage*. It lets a marketing user browse competitor ads in a discovery grid, open any ad to see metadata (hook, audience, landing page, format), and run a 3-step **Clone flow** that takes a source ad and produces an adapted script + render brief for the user's own product.

The flow modeled here is:

1. **Discovery** — grid of competitor ads with filter pills, sort, search.
2. **Ad detail modal** — 9:16 video preview + structured metadata + "Clone this ad" CTA.
3. **Clone flow (3 steps)**:
   - **Add context** — pick your product, choose clone style (Precise / Reimagine), tone, optional notes.
   - **Confirm text** — line-by-line script editor: original transcript on the left, adapted version on the right (1:1 mapping, editable).
   - **Generate video** — upload product imagery, pick render preset (9:16 or 1:1), final notes, see render summary.

## About the Design Files

The files in `design_files/` are **design references created in HTML/JSX** — they are prototypes that demonstrate the intended visual language and interaction model, **not production code to ship**. The task is to **recreate these designs in your target codebase** using its existing framework (React/Next, Vue, SwiftUI, etc.), state management, and component primitives.

If your codebase has a design system, prefer its primitives (Button, Modal, Input, Tabs, etc.) and only fall back to custom CSS for the bits the system doesn't cover (the script editor table, the stepper, the clone-card hover FAB).

## Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, and motion are decided. Recreate pixel-faithfully where reasonable, but adapt to your design system's tokens when there's a conflict.

## Design Tokens

### Colors (oklch-based warm-neutral system + cobalt accent)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `oklch(0.985 0.003 80)` | App background |
| `--surface` | `#ffffff` | Cards, modals, inputs |
| `--surface-2` | `oklch(0.975 0.004 80)` | Subtle fill, search bar, script "original" column |
| `--surface-3` | `oklch(0.955 0.005 80)` | Section headers, hover background |
| `--border` | `oklch(0.92 0.005 80)` | Default borders |
| `--border-strong` | `oklch(0.86 0.006 80)` | Hover borders, dashed upload tile |
| `--ink` | `oklch(0.18 0.005 80)` | Primary text |
| `--ink-2` | `oklch(0.36 0.005 80)` | Secondary text |
| `--ink-3` | `oklch(0.54 0.006 80)` | Tertiary text, captions |
| `--ink-4` | `oklch(0.7 0.005 80)` | Quaternary, monospace numbering |
| `--sidebar` | `oklch(0.18 0.005 80)` | Sidebar background |
| `--sidebar-2` | `oklch(0.22 0.005 80)` | Sidebar item hover |
| `--accent` | `#2D5BFF` | Primary CTA, active state, focus ring |
| `--accent-strong` | `#1f47d6` | Primary hover |
| `--accent-soft` | `oklch(0.96 0.04 265)` | Selected card background |
| `--green` | `oklch(0.7 0.16 150)` | Active dot |
| `--green-soft` | `oklch(0.95 0.04 150)` | Success pill background |

### Typography

- **UI**: Inter, weights 400/500/600/700. Loaded from Google Fonts.
- **Mono**: JetBrains Mono, weights 400/500. Used for metadata, badges, numbers, kbd, section labels.
- Sizes used: 22px (page title), 16px (modal h2), 14px (modal title), 13.5px (body, inputs), 13px (default UI), 12.5px (secondary), 12px (help text), 11px–11.5px (mono metadata), 10–10.5px (uppercase mono labels with `letter-spacing: 0.08em`).

### Spacing & radii

- Page padding: `24px 28px`
- Grid gap: 18px
- Card body padding: `12px 12px 14px`
- Modal padding: `14px 18px` (head/foot), `20–24px 26px` (body)
- Radii: `--r-sm: 6px`, `--r-md: 10px` (cards/inputs), `--r-lg: 14px` (modals), `--r-xl: 20px`
- Buttons: 34px tall (default), 40px (lg), 28px (sm)

### Shadows

- `--shadow-sm`: `0 1px 2px rgba(20,20,30,0.04)`
- `--shadow-md`: `0 4px 14px rgba(20,20,30,0.06), 0 1px 2px rgba(20,20,30,0.04)`
- `--shadow-lg`: `0 24px 60px rgba(20,20,30,0.18), 0 6px 18px rgba(20,20,30,0.08)`
- Clone FAB: `0 6px 16px rgba(45, 91, 255, 0.35)`

### Motion

- Transitions: 120–160ms `ease-out` for color/border/background changes
- Modal fade-in: 160ms; modal pop: 180ms (`scale(0.985) translateY(6px)` → `scale(1) translateY(0)`)
- Card hover: `translateY(-2px)` over 140ms
- Spinner: 700ms linear infinite

## Layout

The app is a 2-column shell:

```
┌────────────┬──────────────────────────────────────────┐
│  Sidebar   │  TopNav (56px tall, sticky)              │
│  (232px)   ├──────────────────────────────────────────┤
│            │                                          │
│  Brand     │  Content (max-width 1600px, 24/28px pad) │
│  Nav items │    page-head                             │
│  + sub     │    toolbar (filter pills + sort)         │
│            │    grid (4-col / 3-col / 2-col)          │
│  Footer:   │                                          │
│  avatar    │                                          │
└────────────┴──────────────────────────────────────────┘
```

Modals are centered overlays with `rgba(15,17,21,0.55)` backdrop + 2px blur.

## Screens

### 1. Sidebar

- 232px wide, dark `--sidebar` background.
- Brand mark (22×22, gradient `#2D5BFF → #6b8bff`, "V") + wordmark "Vantage" (15px, 600).
- Sections with mono uppercase labels (10px, letter-spacing 0.08em): **Research**, **Create**, **Measure**.
- Items: 13.5px, 8/10 padding, 8px radius. Hover → `--sidebar-2`. Active → slightly lighter + white text.
- "Ad Discovery" item is expandable; chevron rotates 90° when expanded. Subnav: "Discovery / Tracked Brands / Similar Brands / Top Picks", left border line, active item gets a 4px accent dot prefix.
- Footer: 26×26 avatar (orange gradient, initials), name, plan, settings icon.

### 2. TopNav

- 56px tall, white background, 1px bottom border.
- Search input: 36px tall, max-width 560px, magnifying-glass icon at left, focus border becomes accent and background → white.
- Right cluster: help icon, bell icon, **+ Track a brand** primary button.

### 3. Discovery page

- **Page head**: title "Ad Discovery" (22px / 600 / -0.012em letter-spacing), subhead in `--ink-3`. Right side: "+ New collection" secondary button.
- **Toolbar**: pill group (All ads / Tracked brands / Similar brands / Top picks). Right: count "20 ads" in mono, "Filters" button, sort toggle ("Most recent" ⇄ "Most used") with chevron.
- **Grid**: `repeat(4, 1fr)` with 18px gap, drops to 3-col below 1280px and 2-col below 940px.

### 4. Ad Card

- White surface, 1px border, 10px radius. Hover: stronger border, `--shadow-md`, lift 2px.
- **Thumb**: 9:16 aspect, decorative striped SVG placeholder (deterministic from seed). Two overlay regions:
  - Top-left: white "Active/Paused" pill with green/gray status dot.
  - Bottom-right: mono duration pill (e.g. "0:24") on dark fill.
- **Clone FAB**: top-right, accent button with wand icon. `opacity: 0` + `translateY(-4px)` by default, fades + slides in on card hover (140ms). `pointer-events: none` until hovered.
- **Body**: brand icon (22×22 colored square, mono initials), brand name (13px / 500), days-ago in mono (`6d`). Footer row separated by border-top: "82 ads use this" + impressions count (with eye icon).

### 5. Ad Detail Modal

- Max-width 1080px, two-column body: 360px media on left, flexible info on right.
- **Media side**: dark `oklch(0.13 0.005 80)` background, 24px padding. 280px-wide 9:16 player with 12px radius, big shadow, "Play preview" pill at bottom-center, 3px scrubber at bottom (38% filled white on rgba(255,255,255,0.18)).
- **Info side**:
  - Brand row: 32×32 brand icon, name (16px / 600), mono meta line (`Platform · Format · Duration · detected Nd ago`), green "Active" badge on the right.
  - 3-up stat strip (bordered, divided): Variants in flight / Est. impressions / Spend tier. Numbers in mono 16px / 600, labels in 11px uppercase mono.
  - **Hook block**: tinted `--surface-2` panel, "HOOK" mono label, body 13.5px line-height 1.5.
  - **KV list** (`grid-template-columns: 130px 1fr`): Landing page (mono link in accent), Target audience, Format tags (chip pills), First detected (mono date).
- **Footer**: "Extract ad copy" ghost button on left, "Close" + "Clone this ad" (primary, lg, with wand icon) on right.

### 6. Clone Modal — Stepper

- 18/22 padding, white background, bottom border.
- Three steps with horizontal connector bars:
  - Inactive: 24×24 circle, 1px `--border-strong`, 12px / 600 number in `--ink-3`.
  - Active: filled with `--accent`, white text, label becomes `--ink` / 600.
  - Done: filled `--ink` (near-black), white check icon, label `--ink-2`.
- Connector bars: 1px line. After a "done" step the bar darkens to `--ink`.

### 7. Clone Modal — Step 1 (Add Context)

- Two columns: form (1fr) + aside (320px).
- **Form**:
  - **Your product**: custom dropdown trigger styled as `.select`. Open state: floating menu with internal search input, list of products (each row: 22×22 thumb, name, SKU in mono), and a separate "+ Add new product" row in accent with top border.
  - **Clone style**: 2-card radio grid. Each card has a 16×16 radio dot (filled w/ accent when selected), heading + description. Selected card: accent border + `--accent-soft` background + 3px focus ring.
  - **Additional context**: textarea, 88px min-height.
  - **Tone & voice**: chip group (5 pills). Selected: accent border + `--accent-soft` + accent-strong text.
- **Aside**:
  - Source ad mini-card: 70px-wide thumbnail, brand name, mono meta, truncated hook in italics-quotes.
  - Info note: tinted `--accent-soft` panel with info icon explaining clones inherit hook/pacing but never brand assets.

### 8. Clone Modal — Step 2 (Confirm Text)

This is the most distinctive screen.

- Header row: section title "Script · N lines" (mono uppercase), help text. Right: green "Text generated successfully" success pill (visible only after generation) + "Regenerate" secondary button.
- **Script table**: 1px border, 10px radius, white surface.
  - Header row (`grid-template-columns: 32px 1fr 1fr 32px`): mono uppercase labels: `#`, "Original ad text", "Adapted for {productLabel}", empty.
  - Data rows: same grid columns. Min-height 48px.
    - `#`: mono zero-padded line number, `--surface-2` background.
    - Original column: 13px text, `--ink-2`, `--surface-2` fill.
    - Edited column: white background, 8/14 padding. Inner `<input>` with transparent border by default; hover → 1px `--border` border + `--surface-2` fill; focus → accent border + 2px focus ring.
    - Pencil column: 1px left border, white background. Hover → accent color + `--accent-soft` fill.
- Footer: kbd hints (`Tab` next, `⌘+↵` save) + transient "Editing line N" indicator in accent.

### 9. Clone Modal — Step 3 (Generate Video)

- Two columns: form (1fr) + summary aside (380px).
- **Form**:
  - **Product imagery**: 3-column image grid. Existing tiles are 1:1, gradient backgrounds (placeholders), with a hover-revealed dark circular X remove button. Final cell: dashed `--border-strong` upload tile, hover → accent border + accent-soft fill, with upload icon + "Click to upload" + mono "PNG · JPG · max 8MB".
  - **Render preset**: same 2-card radio pattern as Step 1 (Vertical 9:16 / Square 1:1).
  - **Final instructions**: textarea.
- **Summary aside**:
  - Header: "Render summary" (13px / 600).
  - Product row: 54×54 thumb + product name + SKU.
  - Summary list: 6 rows with bottom borders (Source / Style / Tone / Aspect / Lines / Est. render). Labels in `--ink-3`, values in `--ink` / 500.
  - **Final script** preview: white panel with 1px border, 220px max-height, scrollable. Each line: dashed bottom divider, mono line number prefix, then adapted text.

### 10. Modal Footer (shared)

- 14/18 padding, `--surface-2` background, top border.
- Left: "Cancel" or "← Back" ghost button.
- Right: step indicator ("Step 1 of 3") in mono caption + primary CTA whose label changes per step:
  - Step 0: **Generate text** + spark icon
  - Step 1: **Confirm text →**
  - Step 2: **Generate video** + wand icon
- During async work, the CTA becomes disabled with a white spinner and label changes to "Generating text…" / "Queueing render…". On completion: success pill "Render queued" with green check.

## Interactions & Behavior

- **Card hover** → reveal Clone FAB (140ms fade+slide), border darkens, lift 2px.
- **Click card** → open Detail modal. **Click Clone FAB** → open Clone modal directly (skip detail).
- **Click "Clone this ad"** in detail footer → close detail, open Clone modal.
- **Search input** → live-filters the grid by brand name, hook text, or vertical (case-insensitive substring).
- **Sort toggle** → flips between `most recent` (ascending by `days`) and `most used` (descending by `useCount`).
- **Filter pills** → state-only in the prototype; wire to your filtering logic.
- **ESC** → closes the topmost modal (clone takes priority over detail).
- **Backdrop click** → closes modal (`stopPropagation` on the modal itself).
- **Stepper** is non-clickable; users advance via the footer CTA.
- **Step 0 → Step 1 transition**: 1.6s simulated "Generating text…" loader, then `lines[i].edited` is populated from a mock adaptation array. In production this is your LLM call.
- **Step 0 modal open**: 1.4s "Analyzing ad reference…" status in the modal header. CTA is disabled until it finishes.
- **Step 2 → done**: 2.2s "Queueing render…" loader, then success pill shown for 1.4s, then modal auto-closes.

## State Management

Top-level state (in `App`):
- `activeNav: string` — sidebar selection
- `activeSub: string` — subnav selection
- `search: string` — search query
- `openAd: Ad | null` — currently-open detail modal
- `cloneAd: Ad | null` — currently-open clone modal

Clone modal local state:
- `step: 0 | 1 | 2`
- `analyzing: boolean` — initial transcription
- `generatingText: boolean` — Step 0 → 1 transition
- `rendering: boolean` — Step 2 submit
- `done: boolean` — render queued
- `state: { productId, style, tone, notes, finalNotes, lines, generated, preset, images, productLabel, editing }`
  - `lines: Array<{ original: string, edited: string }>` — the 1:1 script mapping. **Treat this as the canonical data structure** when wiring to your AI backend; each line is an independently-editable unit so the user can override single beats without losing the rest.

## Data Shapes

```ts
type Brand = { name: string; short: string; color: string; vertical: string };
type Ad = {
  id: string;
  brand: Brand;
  hook: string;
  audience: string;
  landing: string;
  useCount: number;
  days: number;          // days since detected
  active: boolean;
  platform: "TikTok" | "Meta" | "YouTube";
  duration: string;      // "0:24"
  spendTier: "Low" | "Med" | "High";
  impressions: string;   // "2300K"
  format: "UGC" | "Studio" | "Founder POV" | "Static + VO";
  seed: number;          // for the placeholder thumbnail
};
type Product = { id: string; name: string; sku: string; thumb: string };
type ScriptLine = { original: string; edited: string };
```

## Backend Hooks (to implement)

When porting to your codebase, replace the mocked timeouts with real calls:

1. **On Clone modal open** → call your transcription service with the source ad URL. Show "Analyzing ad reference…" until it returns the original `lines[]`.
2. **On "Generate text"** → POST `{ sourceLines, productId, style, tone, notes }` to your LLM. Response should be `adaptedLines: string[]` of equal length to `sourceLines`. Merge into state preserving the 1:1 index mapping.
3. **On "Generate video"** → POST `{ lines, images, preset, finalNotes }` to your render queue. Return a job ID; show success pill, optionally navigate to a renders page to track progress.

## Assets

No external assets. Everything is rendered from CSS, inline SVG icons (`icons.jsx`), and procedural striped placeholders (`ThumbSVG`). When you wire real data, swap `ThumbSVG` for an actual `<video>` or poster `<img>` in:
- `discovery.jsx` — `AdCard` thumbnail
- `detail-modal.jsx` — main player
- `clone-modal.jsx` — Step 1 source-ad mini-thumbnail

All brand names ("Fernweh Coffee", "Lumen Skincare", etc.) and ad copy are fictional and can be discarded — replace with your real fixtures.

## Files in this bundle

- `design_files/Ad Tracker.html` — entry point, App shell, modal orchestration
- `design_files/styles.css` — full token system + every component style
- `design_files/data.js` — mock brands, ads, products, sample script
- `design_files/icons.jsx` — `<Icon>` component (24+ glyphs) + `<ThumbSVG>` placeholder
- `design_files/nav.jsx` — `Sidebar` + `TopNav`
- `design_files/discovery.jsx` — `Toolbar`, `AdCard`, `Discovery` page
- `design_files/detail-modal.jsx` — `DetailModal`
- `design_files/clone-modal.jsx` — `Stepper`, `StepContext`, `StepConfirmText`, `StepGenerate`, `CloneModal`

## Implementation tips

- The script editor is the tricky bit. Build it as a controlled component over `lines: ScriptLine[]`. Each `<input>` is bound to `lines[i].edited`. Keep both columns in the same row container so they stay aligned even with multi-line wrapping.
- The Clone FAB pattern (`opacity: 0` → reveal on parent hover) requires `pointer-events: none` in the hidden state, otherwise it intercepts clicks before the card itself.
- Don't reuse global `styles` object names if you split into multiple files — see component-scoped naming.
- The stepper's "done" state cascades: when step 2 is active, steps 0 and 1 are both `done` and their connector bars darken.
- Use `aria-current="step"` on the active step and `aria-label` on icon-only buttons (close X, pencil edit) for accessibility.
