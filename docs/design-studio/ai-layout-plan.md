# Plan: an AI interior designer for generation (partly built)

**Status: phase 1 is built, with custom wall decor ([decor.md](decor.md#the-ai-designer)).** The
route (`/api/design/ai-generate`), the brief and candidates, one Claude call per flat with a
validated structured answer, product picks the matcher takes where they fit (`MatchOptions.picks`),
floors and walls per room, decor intents resolved against the engine's layout, the per-design cap
(`MAX_AI_GENERATIONS`) and the generation record are in, and the generation runs on the server
as a job that finishes with the page closed — the proposal laid out by `generateScene`, the
function the store's `generate` runs (`lib/api/designJob.ts`). The rules module has started from the owner's
brief ([design-rules.md](design-rules.md): `lib/design/rules.ts` holds the numbers,
`ruleChecks.ts` the first warnings). **Not built:** the rules' scoring of a whole layout, layout constraints per piece (phase 2), the evaluation set,
the retry with violations, explanations in the studio beyond the decor card's note.

This is the plan for letting a model furnish and
finish the flat after the style test, by interior design and building rules, instead of the rule
engine alone. Today generation is the deterministic engine with seeded randomness
([layout-and-matching.md](layout-and-matching.md#generating-is-random)); that engine stays — as the
fallback, and as the part that turns the model's decisions into geometry that is checked.

Related: [overview.md](overview.md) (step 4, `generate`) ·
[layout-and-matching.md](layout-and-matching.md) (the engine, the matcher, the fit check) ·
[finishes.md](finishes.md) (the style's floors and walls) ·
[plan-reading.md](plan-reading.md) (how the app already calls Claude, optionally) ·
[../catalog.md](../catalog.md) (`pnpm audit:studio-products`: what the catalogue can supply).

## What it should do

After the style test (the five questions, or a style picked directly) and the budget, "generate"
asks the model for **a furnished, finished flat**: which pieces each room gets, roughly where
they go and which way they face, which real product fills each piece, which floor and wall
finish each room wears, and one or two sentences per room saying why — in the person's language.
The person then edits it in the studio exactly as today.

## Principles

1. **The app works without a key** (CLAUDE.md rule 8). No `ANTHROPIC_API_KEY`, an error, a
   timeout or an answer that fails validation → today's generation, silently, with the overlay
   saying nothing different. The model *augments*; it is never the only path.
2. **The model decides intent, the engine decides geometry.** The model never hands over raw
   coordinates that are trusted. It answers in terms the engine can realise and check — "the
   sofa against wall 2, facing the TV unit on wall 4", "the bed's head on the wall opposite the
   door" — and `autoLayout` places them with every check it already has (inside the room
   `boxInPolygon`, door keepouts, nothing on anything else, technical anchors). A decision the
   engine cannot realise falls back to the engine's own choice for that piece.
3. **Only real products, chosen from a short list.** The model picks product ids from candidates
   the server prepared per room and kind (pre-filtered by kind, style, budget, and size against
   the room); an id not on the list is ignored. The differentiator stays: every piece is a
   purchasable SKU ([../catalog.md](../catalog.md)).
4. **Rules are code first, prompt second.** The design and building rules live in one pure
   module (`lib/design/rules.ts`, below) that scores any layout. The engine uses it, the model is
   told it, and the model's answer is checked by it — the prompt is not the only place a rule is
   written down.
5. **The server never trusts the client's prices** (rule 3): the model's picks become ordinary
   scene items and are repriced from the catalogue on save, as now.

## The rules (`lib/design/rules.ts`, to write first)

Pure functions over `(room, items, openings, anchors)` returning violations with a severity and
a message — usable without any model, and worth having even if the model never ships:

- **Circulation**: ≥ 90 cm main paths (door to door, door to window), ≥ 60 cm beside a bed,
  ≥ 75–90 cm round a dining table, ≥ 100 cm in front of a kitchen run (`clearance.ts` already
  flags the worst).
- **Function**: sofa to TV 2–3.5 m and facing it; bed reachable from both sides when double;
  the kitchen's work triangle (sink, hob, fridge) 4–7 m; a desk lit from the side, not from
  behind; a nightstand per side of a double bed; a rug under the front legs of the seating.
- **Doors and windows**: nothing in a door's swing or its approach (the keepouts), nothing tall
  across a window, a radiator's front kept clear, curtains only where there is a window.
- **Building**: wet fittings by their technical points (sewer, water — `technical.ts` anchors);
  nothing heavy on a balcony beyond its program; nothing covering the electrical panel or the
  boiler; ventilation of a bathroom without a window (the fan); sockets reachable behind the TV
  unit and the desk ([technical-and-fittings.md](technical-and-fittings.md)).
- **Look**: one product per kind per room; a palette of at most 3–4 colour families per room
  (`lib/design/colors.ts`); floors continuous through open-plan parts; paint calmer in bedrooms.

Each rule has a weight; the engine's `pickNearBest` can add the rules' score to its own, and an
AI answer is accepted when its total is not worse than the engine's for the same plan.

## Architecture

```
style test + budget + plan
   └─▶ POST /api/design/ai-generate  (auth, the design's fee paid, rate limit, maxDuration)
         1. brief: rooms (type, area, polygon as wall list with lengths, doors, windows,
            technical points), style, quiz answers, budget level and total
         2. candidates: per room × kind the top ~8 products (generationWeight + fit), per room
            and surface the top ~10 finishes (generatedFinish's pool) — compact, ids only
         3. Claude (Messages API, structured output against a Zod-derived schema; the catalogue
            part of the prompt cached), one call per flat — rooms in one answer so the flat is
            coherent (one floor through the living space, colours that go together)
         4. validate: schema, ids on the lists, then layout through the engine with the
            model's intents as constraints, then lib/design/rules — one retry with the
            violations listed if it fails; otherwise fall back
   ◀── items, finishes, per-room notes  → designStore.generate applies them like today's result
```

- **Where it plugs in**: `designStore.generate` gets an optional `proposal` (what the route
  returned); without one it runs as now. `layoutRoom` takes `constraints` per piece (which wall,
  facing which piece, near which anchor) and honours them before its own scores;
  `matchProducts` takes `picks` per slot (taken when it fits, else its own draw);
  `defaultFinishes` takes `finishes` per room and surface.
- **The model**: Claude, through the same SDK and key as plan reading
  (`lib/design/aiPlan.ts`, `ANTHROPIC_API_KEY`, `PLAN_MODEL`). A cheaper model may be enough for
  this; it is chosen by evaluation (below), and the model id is a constant, not a guess in code.
- **Cost and latency**: one call per generation, the candidates cached across calls; the
  `GenerationOverlay` already plays for a few seconds and can stream "the living room…" as the
  answer arrives. A cap per design (e.g. three AI generations, then the engine) keeps cost bounded.
- **What is stored**: the scene gets a small `generation` record (engine or model, the model id,
  the time, the seed or the request id, and the per-room notes) so a flat can be explained and a
  bad answer traced. Not the prompt, not the person's data.
- **Privacy**: the plan's geometry, the style and the budget only — no name, address or contact.

## Phases

0. **Rules and metrics** — `lib/design/rules.ts` and a script that scores today's generation on
   the sample plans and the local projects (violations per room, empty slots, budget use,
   variety across seeds). The baseline every later phase must beat. Useful on its own: the
   engine can use the rules' score in `pickNearBest`.
1. **Products and finishes only** — the model picks from the candidate lists, the engine
   places. Low risk: geometry unchanged; the gain is taste (pieces that go together, a palette).
2. **Programs and intent** — the model decides which pieces a room gets (beyond the room
   program: a reading corner, a second desk) and the wall/facing intent per piece; the engine
   realises it under the rules.
3. **Explanations and alternatives** — the per-room notes in the studio ("why this sofa"), and
   "show me another" asking for a variation with what the person kept pinned.
4. **Learning from edits** — what people swap, move and delete after generating, aggregated, fed
   back as candidate weights and as examples in the prompt.

## Evaluation

A fixed set of plans (the sample plans in `public/samples`, the parser's synthetic plans, and
anonymised local projects) × the four styles × three budget levels, generated by the engine and
by each candidate model: rule violations (hard ones must be zero), empty slots, budget deviation,
time and cost per flat, and a blind side-by-side rating of screenshots (`ViewerApi.screenshot`)
by the team. A model ships only when it beats the engine on rating without more hard violations.

## Open questions

- Is AI generation part of the design's fee, or a paid extra? How many regenerations per design?
- How far may the model leave the room program — a second sofa, no TV?
- Explanations in Georgian first: checked by a native speaker before they are shown.
- The store kitchen units: should the model compose a run from several units (nothing does yet,
  [../budget.md](../budget.md#known-gaps))?
