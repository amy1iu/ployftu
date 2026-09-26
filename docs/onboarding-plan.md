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

Getting Started is a trail of small questions (see the README for how it works): website → what they sell (no site) → a fork (a quick win, or a bigger goal) → the other → who they want to reach → the tool the most tasks need. The code picks each one; chips record answers exactly. The website and goal answers still decide the path:

```
"What's your website?"
   ├─ URL ────────────────► (site read in background → profile in the trail)
   └─ no / not live ──────► "What does your business sell?"
                  ▼
Quick win now  ──or──  "What do you most want to grow?" (+ "Not sure yet")
                  ▼
        has site       no site
goal    A Targeted     C Build
unsure  B Diagnose     D Starter
```

| Path | Next | Default quick win | Map emphasis |
| --- | --- | --- | --- |
| A | Who they want to reach, then a tool | The intent's quick win | Intent regions |
| B | Who they want to reach, then a tool | Homepage audit | Regions suggested by site gaps |
| C | What they sell, then who, then a tool | Intent's quick win, or landing page if it needs a site | Intent regions + Site & Brand |
| D | What they sell, then who, then a tool | Landing page draft | Site & Brand, then Leads & Data |

The first deliverable is the one they pick at the fork, or the path's default. Answers can come in any order or all at once; the trail never re-asks.

## UI

- One persistent frame (sidebar, header); routes swap only the main area, with no visible reload.
- Getting Started is the map: questions run down a spine and tasks branch off the answer that revealed or unlocked them, tinted by region. Task ploys link back to it.
- Getting Started is pinned first, in an accent font and color with `x/3` progress while onboarding is active (until completed or skipped).
- Task completions announce through a side pop-up, not in the chat.

## Phases

1. **Foundation + entry flow** (done): schema, workspaces with Start fresh and switcher, persistent layout, Realtime store, pinned Getting Started, catalogs, two-question entry flow with paths A-D, answers written to Docs, evals.
2. **Understand the business** (done): Firecrawl site reading with live progress and a week-long cache, profile playback card (Looks right / Fix something), Brand Guidelines from branding, site-specific opportunities for path B, background profile notes, graceful fallback when a site can't be read.
3. **First value** (done): the quick win starts automatically once the path is set, the profile knows what they sell, and one follow-up is answered; task ploy with kickoff, live plan card (primitives vs. agent tools), real deliverable per recipe (fallback on failure) saved to Docs; completion pop-up; chattable task ploys; opening the deliverable counts toward the tutorial.
4. **The map** (done): a collapsible card taking the right two-thirds beside the chat (over the page on narrow screens), sized to fit; home base with the first win pinned under it; regions lift out of the fog as answers come in, goal regions emphasized with 3 levels; levels ranked by goal and site, personalized per business; state derived from ploys and integrations; hover cards (why, primitives, time, needs) to start a Ploybook as a scripted task ploy; levels need capabilities (a CRM, an email inbox…), connected with any tool via a mock OAuth screen; the agent suggests a level once the first deliverable is done. Sidebar ploys show Idle / Running / Unread with a mocked Rename / Archive / Delete menu.
5. **Polish** (done): a wrap-up card once the tutorial is done (what's set up, what's next) with Finish onboarding; recurring Ploybooks can be turned on (live ★ in the sidebar, header, and map) and off; a failed first deliverable can be retried; demo sites pinned in the crawl cache with their summaries (`npm run seed:demo`); scripted step speed set by `DEMO_STEP_MS`; funnel report from events (`npm run funnel`); narrow screens get a slide-over sidebar and a map overlay that closes on navigation.
6. **The question trail** (done): the chat and map became one experience that reads top-down. Small questions picked by code (website, what they sell, a fork between a quick win and a bigger goal, who they want to reach, a tool), chips that record answers exactly, answered pills that show what each answer meant and how many tasks it added, tasks that hang off the answer that revealed them or wait beside the question that unlocks them (context locks), site-read and build nodes on the spine, a short reply to anything off-script, and a softer region palette. The side map panel is gone.
7. **Later:** agent-composed Ploybooks.

## Gates

| Gate | How |
| --- | --- |
| Functional: seeding, isolation, Realtime p95 < 1s | `npm run check:foundation` |
| No reload on navigation; the trail keeps streaming across routes; refresh restores state | Manual in the browser |
| Intent → capability: path accuracy ≥ 95%, top intent ≥ 85%, unsupported flagged 100%, first win fits the goal ≥ 90%, the goal's Ploybooks on the map ≥ 80% | `npm run eval:entry` |
| Speed: median ≤ 5 cards to finish (max 6), each question ≤ 15 words with 2-5 chips, answer to next card p50 < 2s and p95 < 4s, 0 re-asks | `npm run eval:entry` |
| Extraction precision ≥ 95%; typed trail answers read correctly ≥ 90% | `npm run eval:extract` |
| Tasks hang off the right question, context locks clear when answered | `npm run check:map` |
| Walk each path manually and rate "feels guided" ≥ 4/5 | Manual |
