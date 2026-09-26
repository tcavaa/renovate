# UI and design system

The visual language (tokens, type, corners, motion), the shared step-flow components both
journeys are built from, and the full-window frame of the board steps. Read this before adding
or restyling UI, touching `tailwind.config.ts`, `app/globals.css`, `components/flow/`,
`components/ui/`, `components/layout/` or `components/landing/`.

Related: [architecture.md](architecture.md) (i18n: every string in the dictionaries) ·
[design-studio/studio.md](design-studio/studio.md) (the studio's floating chrome) ·
[design-studio/plan-board.md](design-studio/plan-board.md) (the board's toolbar) ·
[catalog.md](catalog.md#public-pages) (catalogue and product pages) ·
[partners-and-admin.md](partners-and-admin.md) (brigade and worker pages).

## Key files

| File | Responsibility |
|---|---|
| `tailwind.config.ts` | tokens: `brand`, `accent`, `ink` (+ `ink-muted`, `ink-soft`, `ink-faint`), `bg-base`, `bg-surface`, `bg-deep`, `sand`, `slate-deep`, `line`, `success` / `warning` / `danger`; shadows `card`, `cardHover`, `glass`, `float`; the collapsed radius scale |
| `app/globals.css` | shared utilities: `.glass`, `.glass-dark`, `.grain`, `.display`, `.eyebrow`, `.bracket-link`, `.btn-3d`, the scroll-driven `.reveal*` / `.seq*` / `.parallax`, `.studio-bar` container rules, `.site-shell:has([data-flow-workspace])`, `.scrollbar-none` |
| `components/ui/*` | primitives (button with the `ink` variant, card, dialog, input, select, …), `scroll-row.tsx`, `money-row.tsx`, `stat-card.tsx`, `button-3d.tsx` |
| `components/flow/*` | `StepStrip`, `StepHeader`, `StepNav`, `SideList`, `EmptyStep`, `StageBrief`, `FlowGuard`, `FlowWorkspace` (`FlowBar`, `FlowPanel`) |
| `components/layout/*` | `Header` (`HEADER_HEIGHT_CLASS`), `Footer`, `AdminSidebar`, `LanguageSwitcher`, `UserMenu`, `NotFoundContent` |
| `components/landing/*`, `components/motion/*` | the landing page; `CountUp`, `Marquee`, `RotatingBadge` |
| `components/plan/palette.ts` | room tints, origin colours (existing ink / changed terracotta / generated teal), technical-system colours |

## Rules

- Tailwind theme tokens only; headings use `font-serif`; money through `formatGEL()`, areas
  through `formatM2()` (`lib/utils.ts`).
- Corners are sharp outside the build mode; the build-mode surfaces (the step flows and the
  studio) are the deliberate rounded exception.
- Keys are matched on `event.code`, never `event.key` (a Georgian layout types წ for W).
- Every user-facing string goes through `lib/i18n` ([architecture.md](architecture.md#i18n)).

## Design system

Tokens live in `tailwind.config.ts`; the few shared utilities in `app/globals.css`.
- **Surfaces**: warm paper `bg-base` (#F5F2ED), white cards, `sand` for in-between panels,
  `bg-deep` for the one dark band. `.glass` / `.glass-dark` are the frosted panels used over
  imagery and the 3D canvas; `.grain` adds paper texture to large flat areas.
- **Type**: `.display` (heavy uppercase sans, tight tracking) with the `text-display-*`
  clamp scale for hero and section titles; the serif for ordinary headings; `.eyebrow` for
  the small-caps label above them; `.bracket-link` for secondary "( link )" actions.
- **Motion without JavaScript**: `.reveal`, `.reveal-scale`, `.reveal-stagger` and
  `.parallax` are CSS scroll-driven animations (`animation-timeline: view()`), guarded by
  `@supports` and reduced-motion — content is fully visible where they are unsupported. The
  hero words use `.hero-word` (load-time stagger via `--i`). `animate-marquee`,
  `animate-spin-slow`, `animate-float` are the only decorative loops (loaders still use
  `animate-spin` / `animate-pulse`, and the hero has one `animate-bounce`).
- **Scroll sequences** (`.seq` + `.seq-fill/-wipe-up/-wipe-right/-pop/-fade/-fade-out/-rise`,
  and `.drop-in`): an element plays between `--from` and `--to` percent of its `cover` range
  (0 = top edge enters at the bottom of the viewport, 100 = bottom edge leaves at the top; a
  card is fully in view around 35–65). Siblings with staggered ranges play one after another
  — the landing's "no designer" cards are built from these. **Never put a `.seq` element
  inside `overflow-hidden`**: that makes the box a scroll container and `view()` measures
  against it instead of the page, so every step finishes instantly. Clip with
  `overflow-clip`, which does not create a scroller.
- **Landing** (`components/landing/*`): the product wall and the floating price chips are real
  catalogue rows and the product and store counts are database counts; the hero's three
  pictures and the phase and style counts in the stats band are fixed. (The hero's `.parallax`
  images sit inside `overflow-hidden` wrappers — the same `view()` trap as `.seq` below.)
- **Studio** (`app/(main)/design/[id]/studio/page.tsx`): full-bleed canvas, everything else floats
  — see [design-studio/studio.md](design-studio/studio.md). `ViewSwitch` (2D / 3D / walk) and `ZoomControls`
  drive the viewer through the `ViewerApi` it hands back via `onApi`. **Keys are matched on
  `event.code`**, never `event.key`: on a Georgian layout W types წ, and matching the
  character left the viewer standing still.
- **Build-mode surfaces** (the eight-step flow and the studio) use rounded panels
  (`rounded-[12px]`…`[20px]` arbitrary values, since the theme's radius scale is collapsed),
  frosted white bars and big icon tiles with labels; room tints, origin colours (existing
  ink / changed terracotta / generated teal) and technical-system colours live in
  `components/plan/palette.ts`. The editorial site outside the flow keeps sharp corners.
- **Header**: transparent over the landing hero, frosted once scrolled or on any other page.
  The landing hero uses `-mt-[72px]` to sit under it; `HEADER_HEIGHT_CLASS` is the height.
- **Corners are sharp outside the build mode.** The Tailwind radius scale is collapsed to
  0–4 px, so `rounded-2xl` in an older component renders as a crisp edge; do not reach for
  `rounded-full` on buttons, chips or panels — it is reserved for things that are genuinely
  circles (avatars, colour dots, the rotating badge). Cards are flat: hairline `border-line`,
  no shadow. The primary button is `variant="ink"` (near-black, terracotta on hover); the
  Button's *default* variant is still `bg-brand`, and `.btn-3d` / `button-3d.tsx` is the one
  button allowed depth. The
  design flow and the studio are the deliberate exception (see "Build-mode surfaces").
- **Step flows** (`components/flow/*`): both journeys — calculator and studio — are built from
  the same parts. `StepStrip` is the numbered index under the header (`StepIndicator` and
  `DesignSteps` are thin wrappers that supply labels and hrefs); `StepHeader` is the
  "STEP 02 / 05" head with title, lead, meta and actions; `SectionHead` numbers sections
  inside a step; `StepNav` is the sticky bottom bar (back link, running total, one primary
  action); `SideList` is the hairline index used for categories and rooms; `EmptyStep` is
  the "finish the previous step first" card. `Figure` (in `MaterialsTable`) is the large
  number-in-a-cell used for stats and subtotals.
- **The board steps are the whole window** (`components/flow/FlowWorkspace.tsx`, September
  2026). The steps where the 2D board or the 3D scene is open — the calculator's plan (2), the
  design's existing house (2), technical setup (3) and the studio (5 · 6) —
  are, from `lg` up, a design app rather than a page, after a reference floor-planner (a grid
  under everything, the tools floating over it; its features were not copied): the header and
  the step strip stand at the top and never move, the workspace takes every pixel under them,
  and there is no page to scroll and no footer. That is CSS, not JavaScript: a step renders
  `FlowWorkspace` (`data-flow-workspace`; the studio puts the attribute on its own workspace)
  and `.site-shell:has([data-flow-workspace])` in `app/globals.css` gives the shell the
  window's height and hides the footer — so the first paint is right, and a step that is
  showing its `EmptyStep` stays an ordinary page. Inside, the sheet runs edge to edge
  (`PlanWorkspace` with `bleed`: no frame, the grid under everything) and the step's parts
  float over it where the reference puts them: `FlowBar` along the top — the way back as an
  arrow, the step's number and title (a click opens its subtitle and, on the design's steps,
  the five `StageBrief` lines), the step's own actions, the way on; the board's tools down the
  left (`PlanToolTiles`, vertical); what the tool in hand can be told (the wall's shape and
  thickness) along the bottom with the hint over it, next to any tray of the page's own
  (`dock`: the technical kinds); the area in the bottom-left corner; the
  layers and the zoom in a column at the bottom right (`PlanViewControls`); the step's cards
  in `FlowPanel` down the right, scrolling inside itself. `PlanToolbar` is those three parts
  in one row, as before, for everything else. **Whatever floats over the sheet says which edge
  it covers** (`data-board-edge="top|right|bottom|left"`), and `PlanWorkspace` measures them
  whenever the view is fitted (`PlanEditor.fitInsets`): a plan is framed in what the floating
  parts leave, and the zoom buttons zoom about its middle — a plan centred on the canvas sat
  half under the panel. Below `lg` the page renders its ordinary head (`StepHeader`,
  `StageBrief`), the framed board, the cards under it and `StepNav` (`lg:hidden`), and the
  bar is hidden: the markup is one, the classes decide (`lg:contents` lets the stacked
  column's children float). The studio needed only the frame for its 3D view; its 2D view is
  the sheet run under the studio's own bars at every size (`PlanWorkspace` `frameless`, the top
  bar, the rail, the right panel, the tray and the help column tagged with `data-board-edge`),
  its hint for the tool in hand floating above the tray with the studio's other hints
  (`hint={false}` on the board; it stays when the tray is folded), and the zoom column
  zooming and fitting the sheet as it does the camera.
