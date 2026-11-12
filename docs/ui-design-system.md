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
| `tailwind.config.ts` | the ROOMIT tokens: `ink` (+ `ink-muted`, `ink-soft`, `ink-faint`), `lime` (+ `-dark`, `-soft`, `-deep`), `brand` (violet, with a 50–900 scale), the pops `lilac`, `tangerine`, `coral`, `sun`, `cobalt`, the greys `mist` and `stone`, `bg-base`, `bg-surface`, `bg-deep`, `line`, `success` / `warning` / `danger`; shadows `card`, `cardHover`, `glass`, `float`, `pop`; the radius scale; `font-display` |
| `app/layout.tsx` | the fonts: Inter Tight (Latin, Cyrillic) first, Noto Sans Georgian under it, both up to weight 900 |
| `app/icon.svg`, `app/apple-icon.png` | the favicon and the touch icon: a white R and the lime square on a black tile (`apple-icon.png` is rendered from the SVG with sharp) |
| `components/layout/Logo.tsx` | `Logo` (wordmark + optional tagline), `Wordmark` (ROOMIT and the lime square), `LogoMark` (the app icon), `Dot` (the square alone) |
| `app/globals.css` | the heading and `.font-display` voice, shared utilities: `.glass`, `.glass-dark`, `.display`, `.eyebrow`, `.mark`, `.sticker`, `.arch`, `.arrow-link`, `.btn-3d`, `.dots`, the scroll-driven `.reveal*` / `.seq*` / `.parallax`, `.studio-bar` container rules, `.site-shell:has([data-flow-workspace])`, `.scrollbar-none` |
| `components/ui/*` | primitives (button with the `accent` and `ink` variants, card, dialog, input, select, `combobox` — a select with a search, …), `scroll-row.tsx`, `money-row.tsx`, `stat-card.tsx`, `button-3d.tsx` |
| `components/flow/*` | `StepStrip`, `StepHeader`, `StepNav`, `SideList`, `EmptyStep`, `StageBrief`, `FlowGuard`, `FlowWorkspace` (`FlowBar`, `FlowPanel`), `HingeDialog` |
| `components/layout/*` | `Header` (`HEADER_HEIGHT_CLASS`), `Footer`, `AdminSidebar`, `LanguageSwitcher`, `UserMenu`, `NotFoundContent` |
| `components/landing/*`, `components/motion/*` | the landing page; `CountUp`, `Marquee`, `RotatingBadge` |
| `components/plan/palette.ts` | the board's colours (`EDITOR`: black walls, white floors, red doors, blue windows, green balcony railings, a black frame's walls still to build grey, dashed room separators), room-type swatches for the lists, origin colours (existing ink / changed violet / generated teal), technical-system colours |

## Rules

- Tailwind theme tokens only; headings use `font-display` (never a weight class beside it — it
  is 800 by itself); money through `formatGEL()`, areas through `formatM2()` (`lib/utils.ts`).
- Corners are generous everywhere: buttons, chips and segmented controls are pills, cards and
  panels `rounded-2xl` (24 px), tiles and inputs `rounded-xl`, dialogues `rounded-3xl`.
- **What each colour means** — keep to it, it is what makes the pages read as one product:
  *where am I* (the open page, tab, list, the current step) is a lime fill with black text; *on*
  (a filter that is set, a toggle) is a black fill with white text; *picked* (a product, a
  style, a room, a card that is chosen) is violet — a `brand` border or ring with `bg-brand-50`;
  the *main action* is a black pill that turns lime under the pointer, and a screen has at most
  one lime call (`Button variant="accent"`: the way on in `StepNav` / `FlowBar`, "Roomit"); the
  pops (tangerine, coral, sun, cobalt, lilac) are for pictures, numbers and colour blocks, never
  a control. A `hover:bg-lime` always comes with `hover:text-ink`.
- Keys are matched on `event.code`, never `event.key` (a Georgian layout types წ for W).
- Every user-facing string goes through `lib/i18n` ([architecture.md](architecture.md#i18n)).

## Design system

The brand is **ROOMIT** — "Play. Before we ROOMIT." (the site was რემონტი.ge / RenovateGE until
27 Oct 2026 and PLAYCE until 13 Nov 2026). Its look is a design tool's: a near-white page, white
and soft-grey rounded cards, black ink, one heavy tight grotesk for everything, black pill
buttons, lime as the highlighter, violet for what is picked, and flat blocks of bright colour
(lilac, tangerine, coral, sun, cobalt) as decoration. Tokens live in `tailwind.config.ts`; the few
shared utilities in `app/globals.css`.
- **Name and lines**: `t.app.name` is ROOMIT and `t.app.tagline` "Play. Before we ROOMIT." in
  every language (kept English like the name); `t.app.verb` is "Roomit" — the name as a verb, for
  putting a piece into a room (the studio catalogue's place button, the shelf's hint, the hero's
  pill); `t.app.motto` is the localized "Plan. Calculate. Build." (გეგმე. გამოთვალე. გააკეთე.).
- **The marks** (`components/layout/Logo.tsx`): `Wordmark` writes ROOMIT in the sans at weight
  900, tracked tight, and closes it with `Dot` — a lime square, a full stop that is also a room
  seen from above (it takes a text size and colour); `LogoMark` is the app icon — the R and the
  square on a rounded tile in `ink`, `lime`, `white` or `violet`; `Logo` is the wordmark with the
  tagline under it when one is passed (`inverted` on dark grounds). The header, the footer, the
  auth panel and the admin and partner sidebars use `Logo`; the footer closes on a huge white
  `Wordmark`.
- **Palette**: `ink` (#0B0B0C) is the text and the main action. `lime` (#C8F135) is the
  highlighter: what is open or current, the mark behind a word (`.mark`), badges, the grand
  total's block, the one loud call on a screen; text on it is always black. `brand` is violet
  (#6C47FF): what is picked, focus rings on buttons, a person's own pieces. The pops — `lilac`
  (#B9A6FF), `tangerine` (#FF6B1A), `coral`, `sun`, `cobalt` — are for colour blocks, numbers
  and pictures; each but tangerine has a `-soft` tint for icon tiles. `mist` / `mist-light` are
  the quiet grey blocks and hover fills, `stone` the stronger hairline. Pages are `bg-base`
  (#FAFAFA) with white cards `bg-surface`; dark bands and the footer are black `bg-deep` with
  white text and lime accents. The six colours in a row (lime, lilac, tangerine, coral, sun,
  cobalt) edge the footer.
- **Type**: one family. `font-sans` and `font-display` are both Inter Tight for Latin and
  Cyrillic with Georgian falling through to Noto Sans Georgian. Headings (`h1`–`h4`) and
  `.font-display` are weight 800, tracked −0.035em (set in `globals.css`; `.font-display` sits in
  the base layer so a `font-*` or `tracking-*` utility on the element still wins). `.display` is
  the headline voice — weight 900, tighter, with the `text-display-*` clamp scale; `.eyebrow`
  the small bold caps label; an eyebrow over a section title is a chip (a `bg-mist-light` pill
  with a small lime square). `.arrow-link` is the secondary "link →" with a lime underline.
- **Motifs**: `.mark` (a lime block behind a word — ROOMIT in the hero), `.sticker` (a short
  word on a lime block), flat colour blocks — squares, a half circle (`rounded-l-full`), discs,
  a square inside a square, a cobalt checker — with catalogue photos (white grounds) multiplied
  onto them, the studio's selection frame (a lime rectangle with four square handles), `.dots`
  (the drawing sheet's dot grid, for empty stages), `.arch` (kept for a block that wants a round
  top). Used on the public pages and empty states, not inside the tools.
- **Surfaces**: `.glass` / `.glass-dark` are the panels used over imagery and the 3D canvas.
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
- **Landing** (`components/landing/*`): the hero's headline is the brand line on three lines
  (`t.landing.heroLines`, English in every language) with ROOMIT on a lime `.mark`; under it the
  slogan, the two ways in (a black pill and a grey one) and the three hero points as numbered
  cards (the first on lime); beside it a collage — a lilac slab, a tangerine half circle, a coral
  square with a sun square in it, a cobalt disc and checker — with a catalogue chair in the
  studio's lime selection frame, a plant, a side table and the "Roomit" pill; its pictures are
  fixed files in `public/uploads/furniture/`. A black marquee band follows, then the "no
  designer" steps (numbers on black tiles), the product wall (pictures on grey tiles, the price
  in the display face), the four styles, the black stats band (each figure on a block of its own
  colour) and a lime final call. The product wall and the floating price chips are real
  catalogue rows and the product and store counts are database counts; the phase and style
  counts in the stats band are fixed.
- **Studio** (`app/(main)/design/[id]/studio/page.tsx`): full-bleed canvas, everything else floats
  — see [design-studio/studio.md](design-studio/studio.md). `ViewSwitch` (2D / 3D / walk) and `ZoomControls`
  drive the viewer through the `ViewerApi` it hands back via `onApi`. **Keys are matched on
  `event.code`**, never `event.key`: on a Georgian layout W types წ, and matching the
  character left the viewer standing still.
- **The hubs and the profile** (`/calculator`, `/design`, `/profile` — `HubShell`,
  `components/projects/hub/`) look like a design tool's home: a rail of icon-over-label tiles
  with the open one on a lime tile, a heavy breadcrumb title (the product muted), numbered action
  tiles (`ActionTile`: a white icon tile and "1. …" label, the first on lime-soft with a lime
  ring, the rest grey), and cards that are a rounded white frame with the picture on grey, the
  name, the date and a round "…" under it. Headline figures sit in grey tiles, the total on lime.
- **Build-mode surfaces** (the eight-step flow and the studio) use white rounded panels and
  bars floating over the sheet (`shadow-glass`), big icon tiles with labels, the tool in hand on
  a lilac tile and the way on as the lime pill; the plan itself reads like an architect's
  drawing — black walls, white floors, red doors, blue windows — and the board's colours, the
  room-type swatches, origin colours (existing ink / changed violet / generated teal) and
  technical-system colours live in `components/plan/palette.ts`. What is picked is violet
  (#6C47FF) and what is hovered a lighter violet, on the board and in 3D (`Viewer3D`,
  `lib/design3d/outline.ts`, the decor handles and the wall ghosts); the board's paper is a cool
  `#F7F7F8`, the same value `PlanWorkspace` and `FlowWorkspace` paint behind it — change the
  three together.
- **Admin and partner pages** are the same palette at a denser scale: a white sidebar with the
  wordmark and the open section on a lime tile, stat tiles (the ones that want attention on
  lime), tables with a grey caps header, rows waiting for someone tinted lime-soft. Each page opens with
  breadcrumbs and a back button (`AdminCrumbs`), and a list's filters are one framed bar — search
  and sort on top, a row of filter buttons that turn black with their own × when set, their
  choices in a panel under them (`FilterBar`); a list's views are one segmented control
  (`SegmentedLinks`, the open view on lime). Details in [partners-and-admin.md](partners-and-admin.md#admin-lists-filters-sort-and-paging-live-in-the-url).
  A form's long select is a `Combobox` (`components/ui/combobox.tsx`): it looks like `Select`'s
  trigger, opens a Radix popover with a search over the list (`lib/optionSearch.ts`), indents a
  tree by `depth` and shows a match with its parents, and takes the arrows, PageUp/PageDown,
  Enter, Escape and a letter typed on the closed box; options carry `keywords` (other names, a
  key), a `hint` at the row's end and a `selectedLabel` for the closed box. Short lists stay
  `Select`. Its strings are `common.typeToSearch` and `common.noMatches`
  ([catalog.md](catalog.md#managing-the-catalogue) has the product form's use).
- **Header**: the wordmark, the navigation centred as plain bold words (the open page on a lime
  pill, the others turning grey under the pointer), the account on the right as a grey pill with
  the initials on a lime disc, the languages as small pills (the open one black); clear over the
  landing hero, frosted white with a hairline once scrolled or on any other page.
  The landing hero uses `-mt-[72px]` to sit under it; `HEADER_HEIGHT_CLASS` is the height.
- **Corners are generous.** The radius scale is 6–32 px (`rounded` 8, `-lg` 14, `-xl` 16,
  `-2xl` 24, `-3xl` 32). `Button` is a pill (`rounded-full`, semibold): the default variant (and
  `ink`, the same thing under the name the pages already used) is black turning lime with black
  text on hover, `accent` is the lime call turning black, `secondary` a grey pill, `outline` a
  hairline pill on white, `link` an underline in lime; chips, badges, filter buttons and
  segmented controls are pills too (`Badge` is lime by default, black as `secondary`). Cards are
  `rounded-2xl` with a hairline `border-line`, or borderless on `bg-mist-light`; inputs and
  selects are 44 px high, `rounded-xl`, and take a black border with a 3 px lime ring on focus;
  dialogues and popovers `rounded-2xl`–`3xl` with `shadow-float` (a dialogue's ✕ is a round grey
  button). Tables sit in a rounded bordered wrapper with a `bg-mist-light` header row.
  `.btn-3d` / `button-3d.tsx` is the one button allowed a hard offset shadow (lime, black edge).
- **Step flows** (`components/flow/*`): both journeys — calculator and studio — are built from
  the same parts. `StepStrip` is the numbered index under the header — a row of pills, the
  current step on lime, the ones done with a lime tick on black (`StepIndicator` and
  `DesignSteps` are thin wrappers that supply labels and hrefs); `StepHeader` is the head with
  the step's number on a lime chip, the title, lead, meta and actions; `SectionHead` numbers
  sections inside a step (the number lime on black); `StepNav` is the sticky bottom bar (a grey
  back pill, running total, the one lime action); `SideList` is the index used for categories
  and rooms, the open row on lime with its count on black; `EmptyStep` is
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
