# Onboarding Agent

A first-time-user experience for Ploy: a Getting Started chat that learns the user's business, delivers a quick win, and grows a map of what Ploy can do for them. Single-user demo, no auth. See [docs/onboarding-plan.md](docs/onboarding-plan.md) for the plan and phases.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Vercel AI SDK 7 · Vercel AI Gateway · Supabase (Postgres + Realtime) · Firecrawl

## Setup

```bash
cp .env.example .env.local   # fill in keys
npx supabase link && npx supabase db push
npm run seed:demo   # optional: pin the demo sites so they read instantly
npm run dev
```

Set `DEMO_STEP_MS` in `.env.local` to change how long each scripted task step takes (default 1800ms).

## Scripts

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests: catalog integrity, OpenAI strict-mode schemas, entry logic, doc patching |
| `npm run check:foundation` | Workspace seeding, isolation between runs, Realtime latency |
| `npm run check:site [url]` | Reads a real website: progress, drafted profile, branding, time to profile |
| `npm run check:quick-wins [url]` | Every quick-win recipe produces a real deliverable (no fallback) from a real site's profile |
| `npm run check:map` | Answers reveal and emphasize the right regions, levels are personalized, sync is idempotent, levels unlock and run |
| `npm run eval:extract` | Precision of recording answers from single messages, and of reading typed trail answers (answered, matched chip, summary, off-script) |
| `npm run eval:entry` | 24 simulated users through the real Getting Started trail (tapping chips or typing), scored on how quickly and accurately it matches their intent to the right capability |
| `npm run seed:demo` | Pins the demo sites (intelligentsia.com, linear.app, glossier.com) in the crawl cache with their summaries, so demos skip the crawl |
| `npm run funnel` | Onboarding funnel across real runs: how many reach each step, timings, paths, and requests Ploy doesn't cover |

Eval results land in `evals/results/`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/(workspace)/` | Routes sharing one persistent frame: `/` Getting Started, `/ploys/[id]`, `/docs/[[...slug]]` |
| `src/app/actions.ts` | Start fresh, switch workspace, mark onboarding done/skipped, start map tasks, connect tools, turn Ploybooks on/off, retry a failed deliverable |
| `src/app/api/chat/route.ts` | Getting Started turns |
| `src/lib/ai/onboarding/` | A trail step: record the answer, start the first deliverable, write the next card; the wording prompt and answer extraction |
| `src/lib/catalog/` | Ploy primitives, agent tools, regions, intents, Ploybook templates, quick wins |
| `src/lib/onboarding/` | The trail's questions and order, applying answers, entry paths (A–D), greeting |
| `src/lib/docs/` | Profile docs (Markdown source of truth) and section patching |
| `src/lib/site/` | Reading the user's website with Firecrawl: key pages, summary, branding, opportunities |
| `src/lib/quick-wins/` | The first deliverable: when it starts, generation (with fallback), and its Markdown |
| `src/lib/tasks/` | What every task ploy shares: kickoff and plan card, ticking steps, chat replies |
| `src/lib/map/` | The growth map: region reveal and emphasis, which tasks show and where they hang on the trail, derived task state (incl. waiting on context), sync and personalization, starting tasks |
| `src/components/trail/` | The Getting Started trail: question cards and the fork, answered pills, site-read and build nodes, task cards |
| `src/components/map/` | Task details popover, mock integration connect, region colors |
| `src/components/task-toasts.tsx` | Side pop-up when a task finishes |
| `src/lib/db/` | Row types and server-side queries (secret key) |
| `src/components/workspace/workspace-provider.tsx` | Client store kept fresh by Realtime; owns the Getting Started chat |
| `evals/` | Foundation checks, extraction eval, persona eval |
| `supabase/migrations/` | Schema |

## How the Getting Started trail works

Getting Started is one experience: a map that reads top-down like a chat. Its spine is small questions (each answerable in under a minute) and background work; tasks branch off the question that revealed them, or the one whose answer they're waiting on.

1. **The code picks each question** (`src/lib/onboarding/trail.ts`), always in this order, skipping any it already has an answer for: website → what they sell (no site) → a fork (a quick win now, or a bigger goal) → the other → who they want to reach → the tool the most tasks need → done.
2. **Chips carry values.** Tapping one records the answer exactly, with no model call (a bare URL doesn't need one either). Typed answers go through the extractor, which also returns a short summary, the chip it matches, and anything off-script. Answers land in `workspaces.entry` and the profile Docs, and each becomes a pill showing what it meant.
3. **The model only writes what the code can't:** the follow-up question and its chips (specific to their business) and replies to anything off-script.
4. **The first deliverable** starts when they pick a quick win at the fork, or on the goal path once we know who it's for. It runs while they keep answering: a task ploy with a plan card, the real deliverable (one retry, then a template fallback), a copy in Docs, and a side pop-up.
5. **In the background** (`after()`): the site is read (homepage + up to 4 key pages, then branding) and summarized into the Docs as *inferred*, shown in the trail's site-read node with Looks right / Fix something. The map syncs after every answer: regions lift from the fog, the goal's regions get more tasks, tasks are personalized, and each gets an `anchor` for its place on the trail. Task state (waiting on an answer, needs a tool, ready, running, done, live) is derived, never stored.
