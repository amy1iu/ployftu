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
| `npm run eval:extract` | Precision of recording answers from single messages |
| `npm run eval:entry` | 24 simulated users through the real Getting Started flow, scored against the phase 1 gates |
| `npm run seed:demo` | Pins the demo sites (intelligentsia.com, linear.app, glossier.com) in the crawl cache with their summaries, so demos skip the crawl |
| `npm run funnel` | Onboarding funnel across real runs: how many reach each step, timings, paths, and requests Ploy doesn't cover |

Eval results land in `evals/results/`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/(workspace)/` | Routes sharing one persistent frame: `/` Getting Started, `/ploys/[id]`, `/docs/[[...slug]]` |
| `src/app/actions.ts` | Start fresh, switch workspace, mark onboarding done/skipped, start map tasks, connect tools, turn Ploybooks on/off, retry a failed deliverable |
| `src/app/api/chat/route.ts` | Getting Started turns |
| `src/lib/ai/onboarding/` | The Getting Started agent: turn pipeline, prompt, answer extraction, reply chips |
| `src/lib/catalog/` | Ploy primitives, agent tools, regions, intents, Ploybook templates, quick wins |
| `src/lib/onboarding/` | Entry questions and paths (A–D), greeting, tutorial progress |
| `src/lib/docs/` | Profile docs (Markdown source of truth) and section patching |
| `src/lib/site/` | Reading the user's website with Firecrawl: key pages, summary, branding, opportunities |
| `src/lib/quick-wins/` | The first deliverable: when it starts, generation (with fallback), and its Markdown |
| `src/lib/tasks/` | What every task ploy shares: kickoff and plan card, ticking steps, chat replies |
| `src/lib/map/` | The growth map: region reveal and emphasis, derived level state, sync and personalization, starting levels |
| `src/components/map/` | Map panel (collapsible), size-aware layout, level hover cards, mock integration connect |
| `src/components/task-toasts.tsx` | Side pop-up when a task finishes |
| `src/lib/db/` | Row types and server-side queries (secret key) |
| `src/components/workspace/workspace-provider.tsx` | Client store kept fresh by Realtime; owns the Getting Started chat |
| `evals/` | Foundation checks, extraction eval, persona eval |
| `supabase/migrations/` | Schema |

## How a Getting Started turn works

1. The reply streams immediately, from a prompt holding the entry flowchart and what's recorded so far. It's a structured object (`message`, `question`, `replies`), rendered as the message a sentence at a time, then one bold question, then reply chips (a `data-replies` part), so the format holds on any model.
2. In parallel, the user's latest message is parsed into structured answers (website, goals, business), each backed by a quote from the user, and written to `workspaces.entry` and the profile Docs.
3. In the background (`after()`): the first time a URL is recorded, the site is read (homepage + up to 4 key pages, then branding) and summarized into the Business Overview and Brand Guidelines as *inferred*; the chat's site card follows `workspaces.crawl` over Realtime and asks the user to confirm. Separately, anything the user says about their offering, customers, channels, tools, or voice is merged into the Docs.
4. Once the path is set, the profile says what they sell, and they've answered one follow-up, the turn starts the first deliverable (a quick win) in its own task ploy: a kickoff with a plan card of Ploy primitives, the real deliverable (one retry, then a template fallback), a copy in Docs, and a side pop-up when it's ready.
5. After each turn (and when the site is read or the first deliverable finishes), the growth map syncs: each answer lifts fog from regions, the user's goals emphasize theirs with more levels, and new levels get personalized titles. Level state (locked, available, running, done) is derived from ploys and integrations, never stored.
