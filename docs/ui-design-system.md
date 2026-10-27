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
| `tailwind.config.ts` | the PLAYCE tokens: `brand` (terracotta), `accent` / `wood`, `olive`, `stone`, `sand`, `charcoal`, `ink` (+ `ink-muted`, `ink-soft`, `ink-faint`), `bg-base`, `bg-surface`, `bg-deep`, `slate-deep` (olive), `line`, `success` / `warning` / `danger`; shadows `card`, `cardHover`, `glass`, `float`; the soft radius scale |
| `app/layout.tsx` | the fonts: Jost and Cormorant Garamond (Latin, Cyrillic) first, Noto Sans / Serif Georgian under them |
| `app/icon.svg`, `app/apple-icon.png` | the favicon and the touch icon: the chevron on a terracotta tile |
| `components/layout/Logo.tsx` | `Logo` (tile + wordmark + tagline), `Wordmark` (PLΛYCE), `LogoMark` (the app icon), `Chevron` |
| `app/globals.css` | shared utilities: `.glass`, `.glass-dark`, `.grain`, `.display`, `.eyebrow`, `.paper-label`, `.arch`, `.bracket-link`, `.btn-3d`, the scroll-driven `.reveal*` / `.seq*` / `.parallax`, `.studio-bar` container rules, `.site-shell:has([data-flow-workspace])`, `.scrollbar-none` |
| `components/ui/*` | primitives (button with the `ink` variant, card, dialog, input, select, `combobox` — a select with a search, …), `scroll-row.tsx`, `money-row.tsx`, `stat-card.tsx`, `button-3d.tsx` |
| `components/flow/*` | `StepStrip`, `StepHeader`, `StepNav`, `SideList`, `EmptyStep`, `StageBrief`, `FlowGuard`, `FlowWorkspace` (`FlowBar`, `FlowPanel`), `HingeDialog` |
| `components/layout/*` | `Header` (`HEADER_HEIGHT_CLASS`), `Footer`, `AdminSidebar`, `LanguageSwitcher`, `UserMenu`, `NotFoundContent` |
| `components/landing/*`, `components/motion/*` | the landing page; `CountUp`, `Marquee`, `RotatingBadge` |
| `components/plan/palette.ts` | the board's colours (`EDITOR`: black walls, white floors, red doors, blue windows, green balcony railings, a black frame's walls still to build grey, dashed room separators), room-type swatches for the lists, origin colours (existing ink / changed terracotta / generated teal), technical-system colours |

## Rules

- Tailwind theme tokens only; headings use `font-serif`; money through `formatGEL()`, areas
  through `formatM2()` (`lib/utils.ts`).
- Corners are soft everywhere: buttons, chips and segmented controls are pills, cards and panels
  `rounded-2xl`, inputs `rounded-xl`, dialogues `rounded-3xl`.
- Keys are matched on `event.code`, never `event.key` (a Georgian layout types წ for W).
- Every user-facing string goes through `lib/i18n` ([architecture.md](architecture.md#i18n)).

## Design system

The brand is **PLAYCE** — "Play with your place" (until 27 Oct 2026 the site was რემონტი.ge /
RenovateGE). Its look comes from the brand board: sand paper, stone, wood, terracotta, olive and
charcoal; soft rounded shapes, arches, pill buttons, paper labels; airy wide-tracked capitals and
an elegant serif. Tokens live in `tailwind.config.ts`; the few shared utilities in `app/globals.css`.
- **Name and lines**: `t.app.name` is PLAYCE and `t.app.tagline` "Play with your place" in every
  language (a wordplay, kept English like the name); `t.app.motto` is the localized "Plan.
  Calculate. Build." (გეგმე. გამოთვალე. გააკეთე.).
- **The marks** (`components/layout/Logo.tsx`): the brand's A is an open chevron with no crossbar.
  `Wordmark` writes PLΛYCE in the sans with the chevron drawn in (it takes a text size and colour);
  `LogoMark` is the app icon — the chevron on a rounded tile in `sand`, `terracotta`, `olive` or
  `ink`; `Logo` is the two with the tagline under them (`inverted` on dark grounds). The header,
  the footer, the auth panel and the admin sidebar use `Logo`; the footer closes on a huge faint
  `Wordmark`.
- **Palette**: `brand` is terracotta (#B5462B) — the one loud colour: the main action, links, what
  is picked. `olive` (#34402F) is the dark ground (`bg-deep`, the footer, the stats band, the auth
  panel) and the quiet second action (`Button variant="secondary"`); `wood` / `accent` (#A8784E)
  and `stone` are warm secondary accents; `sand` the in-between panels and the selected pill;
  `ink` is charcoal (#1E1F23). Pages are sand paper `bg-base` (#F3EEE6) with warm-white cards
  `bg-surface` (#FFFDF9). The six swatches in a row (sand, stone, wood, terracotta, olive,
  charcoal) edge the footer.
- **Type**: `font-sans` is Jost (the wordmark's geometric sans) and `font-serif` Cormorant
  Garamond, each for Latin and Cyrillic; Georgian falls through to Noto Sans / Serif Georgian.
  Headings are the serif (lining figures are switched on for it in `globals.css`). `.display` is
  the sans in light, wide-tracked capitals with the `text-display-*` clamp scale; `.eyebrow` the
  small spaced label above a heading; `.bracket-link` for secondary "( link )" actions.
- **Motifs**: `.arch` (an arch-topped picture or colour block — the hero's chair, the auth
  panel), `.paper-label` (a cream paper tag with serif capitals — the tagline torn into words),
  colour blocks in terracotta and olive behind pictures, catalogue photos (white grounds)
  multiplied onto them. Used on the public pages and empty states, not inside the tools.
- **Surfaces**: `.glass` / `.glass-dark` are the frosted panels used over imagery and the 3D
  canvas; `.grain` adds paper texture to large flat areas.
- **Motion without JavaScript**: `.reveal`, `.reveal-scale`, `.reveal-stagger` and
  `.parallax` are CSS scroll-driven animations (`animation-timeline: view()`), guarded by
  `@supports` and reduced-motion — content is fully visible where they are unsupported. The
  hero words use `.hero-word` (load-time stagger via `--i`). `animate-marquee`,
  `animate-spin-slow`, `animate-float` are the only decorative loops (loaders still use
  `animate-spin` / `animate-pulse`, and the hero has one `animate-bounce`). `animate-countdown`
  fills a bar once while a page waits to move on (its length set with `animation-duration` —
  the checkout's thank-you before the orders open). `animate-shake` (a wrong answer) and
  `animate-pop` (something just landed) play once, for the plan-reading game.
- **Scroll sequences** (`.seq` + `.seq-fill/-wipe-up/-wipe-right/-pop/-fade/-fade-out/-rise`,
  and `.drop-in`): an element plays between `--from` and `--to` percent of its `cover` range
  (0 = top edge enters at the bottom of the viewport, 100 = bottom edge leaves at the top; a
  card is fully in view around 35–65). Siblings with staggered ranges play one after another
  — the landing's "no designer" cards are built from these. **Never put a `.seq` element
  inside `overflow-hidden`**: that makes the box a scroll container and `view()` measures
  against it instead of the page, so every step finishes instantly. Clip with
  `overflow-clip`, which does not create a scroller.
- **Landing** (`components/landing/*`): the hero is laid out like the brand board — the three
  words in display capitals on the left, a moodboard on the right (a stone arch with a catalogue
  chair, terracotta and olive blocks, a travertine table, a plant in a terracotta pot, the tagline
  as paper labels, the app icon and the motto on the rotating badge); its pictures are fixed files
  in `public/uploads/furniture/`. The product wall and the floating price chips are real
  catalogue rows and the product and store counts are database counts; the phase and style
  counts in the stats band are fixed.
- **Studio** (`app/(main)/design/[id]/studio/page.tsx`): full-bleed canvas, everything else floats
  — see [design-studio/studio.md](design-studio/studio.md). `ViewSwitch` (2D / 3D / walk) and `ZoomControls`
  drive the viewer through the `ViewerApi` it hands back via `onApi`. **Keys are matched on
  `event.code`**, never `event.key`: on a Georgian layout W types წ, and matching the
  character left the viewer standing still.
- **The hubs and the profile** (`/calculator`, `/design`, `/profile` — `HubShell`,
  `components/projects/hub/`) look like a file manager's "my files" and take the build mode's
  rounding: a sidebar of lists with the open one on a
  rounded sand pill, a breadcrumb title in the serif (the product muted), round coloured action
  buttons with their names under them, and cards that are a rounded white frame with the name,
  the date and a round "…" under it.
- **Build-mode surfaces** (the eight-step flow and the studio) use rounded panels
  (`rounded-[12px]`…`[20px]` arbitrary values, since the theme's radius scale is collapsed),
  frosted white bars and big icon tiles with labels; the plan itself reads like an
  architect's drawing — black walls, white floors, red doors, blue windows — and the board's
  colours, the room-type swatches, origin colours (existing ink / changed terracotta / generated
  teal) and technical-system colours live in `components/plan/palette.ts`. What is picked is
  terracotta and what is hovered wood, on the board and in 3D (`Viewer3D`, `lib/design3d/outline.ts`);
  the board's paper is a warm `#FBF8F2`, the same value `PlanWorkspace` and `FlowWorkspace` paint
  behind it — change the three together.
- **Admin pages** are the same palette at a denser scale (rounded panels, pill filters): each opens with
  breadcrumbs and a back button (`AdminCrumbs`), and a list's filters are one framed bar — search
  and sort on top, a row of filter buttons that turn ink-dark with their own × when set, their
  choices in a panel under them (`FilterBar`); a list's views are one segmented control
  (`SegmentedLinks`). Details in [partners-and-admin.md](partners-and-admin.md#admin-lists-filters-sort-and-paging-live-in-the-url).
  A form's long select is a `Combobox` (`components/ui/combobox.tsx`): it looks like `Select`'s
  trigger, opens a Radix popover with a search over the list (`lib/optionSearch.ts`), indents a
  tree by `depth` and shows a match with its parents, and takes the arrows, PageUp/PageDown,
  Enter, Escape and a letter typed on the closed box; options carry `keywords` (other names, a
  key), a `hint` at the row's end and a `selectedLabel` for the closed box. Short lists stay
  `Select`. Its strings are `common.typeToSearch` and `common.noMatches`
  ([catalog.md](catalog.md#managing-the-catalogue) has the product form's use).
- **Header**: the `Logo` lockup, the navigation centred in a pill track (the open page on a sand
  pill with a terracotta dot), the account on the right; transparent over the landing hero, frosted
  sand once scrolled or on any other page.
  The landing hero uses `-mt-[72px]` to sit under it; `HEADER_HEIGHT_CLASS` is the height.
- **Corners are soft.** The radius scale is 4–28 px (`rounded` 6, `-lg` 12, `-xl` 16, `-2xl` 20,
  `-3xl` 28). `Button` is a pill (`rounded-full`): its default variant is terracotta, `ink` is
  charcoal turning terracotta on hover, `secondary` olive, `outline` a hairline pill; chips,
  badges, filter buttons and segmented controls are pills too. Cards are `rounded-2xl` with a
  hairline `border-line`, flat or with the low warm `shadow-card`; inputs and selects
  `rounded-xl`; dialogues and popovers `rounded-2xl`–`3xl` with `shadow-float`. Tables sit in a
  rounded bordered wrapper with a sand header row. `.btn-3d` / `button-3d.tsx` is the one button
  allowed a hard offset shadow.
- **Step flows** (`components/flow/*`): both journeys — calculator and studio — are built from
  the same parts. `StepStrip` is the numbered index under the header (`StepIndicator` and
  `DesignSteps` are thin wrappers that supply labels and hrefs); `StepHeader` is the
  "STEP 02 / 05" head with title, lead, meta and actions; `SectionHead` numbers sections
  inside a step; `StepNav` is the sticky bottom bar (back link, running total, one primary
  action); `SideList` is the hairline index used for categories and rooms; `EmptyStep` is
  the "finish the previous step first" card; `HingeDialog` is the warning
  before a step that shuts the ones before it (a warning icon, a checklist, a padlock line). The
  card step (`components/payments/CardPayment.tsx`) is two
  columns in a dialogue widened to 56 rem — the bill (price · bank commission · total) and the
  notes on the left, Flitt's embedded form on the right — and the dialogue is **not modal**
  while it is up, drawing its own backdrop (`DialogContent backdrop`), because Flitt's 3-D Secure
  window lives outside it ([payments.md](payments.md#the-dialogue-cardpayment)). `Figure` (in `MaterialsTable`) is the large
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
  left (`PlanToolTiles`, vertical); what the tool in hand can be told (the wall's shape — a
  line, a square, a room separator — and its thickness, compact and side by side in one row)
  along the bottom with the hint over it, next to any tray of the page's own (`dock`: the
  technical kinds; the calculator's plan step docks the studio's technical and electric trays
  there); the area in the bottom-left corner, and over it, in a black frame, the
  legend of the walls to build and the ones already built; the
  layers and the zoom in a column at the bottom right (`PlanViewControls`); the step's cards
  in `FlowPanel` down the right, scrolling inside itself — and, on the calculator's and the
  design's plan steps, what is picked on the board in a card of its own laid over that panel while it is open
  (`FlowPanelOverlay`), with a ✕ (`InspectorClose`), rather than stacked into the panel's list. `PlanToolbar` is those three parts
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
