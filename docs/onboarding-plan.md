# Onboarding plan

The first-time experience has two jobs: learn as much as possible about the user's business, and deliver value within the first few minutes. It runs as a flywheel: the user gives context, we show something valuable, and that earns more context.

## Scope and constraints

- **Single-user demo.** No auth; every row carries a constant `user_id`. One workspace = one business = one onboarding run. "Start fresh" creates a new workspace; old ones stay and can be switched back to.
- **Catalog-driven.** The agent chooses from and personalizes known primitives, Ploybook templates, and quick wins; it never invents capabilities. Later, it may compose custom Ploybooks from primitives (same spec shape, `source: "composed"`).
- **Only quick wins do real work.** Task ploys show what a Ploybook *would* do: a scripted chat that explains the goal and primitives, then completes. Integrations are mocked.
- **Docs are the source of truth.** The business profile lives in Markdown Docs (Business Overview, Goals & Focus, Channels & Tools, Brand Guidelines) with fixed `##` sections, patched one section at a time. Every agent reads them.

## Catalog

- **Ploy primitives:** Docs, Brand Guidelines (stored as a Doc), PloyDB, Ploybooks (automations), Sites, Integrations, Ads, Analytics.
- **Agent tools** (kept separate from primitives): scrape site, research company (Firecrawl).
- **Regions** of the growth map: Site & Brand, Leads & Data, Campaigns, Measure.
- **Intents** map what users say they want to regions, templates, and a default quick win.
- **Quick wins:** homepage audit, outreach sequence, look-alike accounts, social posts, landing page draft.

## Entry flow

The first turns answer two questions; everything later branches on them.

```
Greeting: "Do you have a website?" (+ what we can do if not)
   ├─ URL ────────────────► (site read in background → profile card)
   └─ no / not live ──────► "Tell me what you do"
                  ▼
"Is there a goal you're working toward?" (+ "not sure? I'll suggest")
                  ▼
        has site       no site
goal    A Targeted     C Build
unsure  B Diagnose     D Starter
```

| Path | Next | Default quick win | Map emphasis |
| --- | --- | --- | --- |
| A | Play back site + goal, ask the goal's follow-ups | The intent's quick win | Intent regions |
| B | Suggest 2-3 opportunities from the site | Homepage audit | Regions suggested by site gaps |
| C | Short business questions, then follow-ups | Intent's quick win, or landing page if it needs a site | Intent regions + Site & Brand |
| D | Business questions, then a starter path | Landing page draft | Site & Brand, then Leads & Data |

Answers can come in any order or all at once; the agent never re-asks.

## UI

- One persistent frame (sidebar, header, map panel); routes swap only the main area, with no visible reload.
- Getting Started is pinned first, in an accent font and color with `x/3` progress while onboarding is active (until completed or skipped).
- Task completions announce through a side pop-up, not in the chat.
- Tutorial completion: confirm profile → open the first deliverable → start one map level (`src/lib/onboarding/tutorial.ts`).

## Phases

1. **Foundation + entry flow** (done): schema, workspaces with Start fresh and switcher, persistent layout, Realtime store, pinned Getting Started, catalogs, two-question entry flow with paths A-D, answers written to Docs, evals.
2. **Understand the business** (done): Firecrawl site reading with live progress and a week-long cache, profile playback card (Looks right / Fix something), Brand Guidelines from branding, site-specific opportunities for path B, background profile notes, graceful fallback when a site can't be read.
3. **First value** (done): the quick win starts automatically once the path is set, the profile knows what they sell, and one follow-up is answered; task ploy with kickoff, live plan card (primitives vs. agent tools), real deliverable per recipe (fallback on failure) saved to Docs; completion pop-up; chattable task ploys; opening the deliverable counts toward the tutorial.
4. **The map:** hub-and-spoke map with focus emphasis and fog, ranking/personalization, derived node state, node drawer to start a Ploybook, mock connect modal.
5. **Polish:** wrap-up plan, mark done/skip, failure paths, demo speed, events, narrow screens, fixture workspace.
6. **Later:** agent-composed Ploybooks.

## Phase 1 gates

| Gate | How |
| --- | --- |
| Functional: seeding, isolation, Realtime p95 < 1s | `npm run check:foundation` |
| No reload on navigation; chat keeps streaming across routes; refresh restores state | Manual in the browser |
| Entry flow: path accuracy ≥ 95%, median ≤ 2 user turns, 0 re-asks, one question per message ≥ 95%, guidance ≥ 90%, intent match ≥ 85%, unsupported flagged 100%, docs ≥ 95% | `npm run eval:entry` |
| Extraction precision ≥ 95% | `npm run eval:extract` |
| Time to first token p50 < 1.5s, p95 < 3s | `npm run eval:entry` |
| Walk each path manually and rate "feels guided" ≥ 4/5 | Manual |
