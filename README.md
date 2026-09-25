# Onboarding Agent

A first-time-user experience for Ploy: a Getting Started chat that learns the user's business, delivers a quick win, and grows a map of what Ploy can do for them. Single-user demo, no auth. See [docs/onboarding-plan.md](docs/onboarding-plan.md) for the plan and phases.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Vercel AI SDK 7 · Vercel AI Gateway · Supabase (Postgres + Realtime) · Firecrawl

## Setup

```bash
cp .env.example .env.local   # fill in keys
npx supabase link && npx supabase db push
npm run dev
```

## Scripts

| Script | What it checks |
| --- | --- |
| `npm test` | Unit tests: catalog integrity, OpenAI strict-mode schemas, entry logic, doc patching |
| `npm run check:foundation` | Workspace seeding, isolation between runs, Realtime latency |
| `npm run eval:extract` | Precision of recording answers from single messages |
| `npm run eval:entry` | 24 simulated users through the real Getting Started flow, scored against the phase 1 gates |

Eval results land in `evals/results/`.

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/(workspace)/` | Routes sharing one persistent frame: `/` Getting Started, `/ploys/[id]`, `/docs/[[...slug]]` |
| `src/app/actions.ts` | Start fresh, switch workspace, mark onboarding done/skipped |
| `src/app/api/chat/route.ts` | Getting Started turns |
| `src/lib/ai/onboarding/` | The Getting Started agent: turn pipeline, prompt, answer extraction, reply chips |
| `src/lib/catalog/` | Ploy primitives, agent tools, regions, intents, Ploybook templates, quick wins |
| `src/lib/onboarding/` | Entry questions and paths (A–D), greeting, tutorial progress |
| `src/lib/docs/` | Profile docs (Markdown source of truth) and section patching |
| `src/lib/db/` | Row types and server-side queries (secret key) |
| `src/components/workspace/workspace-provider.tsx` | Client store kept fresh by Realtime; owns the Getting Started chat |
| `evals/` | Foundation checks, extraction eval, persona eval |
| `supabase/migrations/` | Schema |

## How a Getting Started turn works

1. The reply streams immediately, from a prompt holding the entry flowchart and what's recorded so far. It's a structured object (`message`, `question`, `replies`), rendered as the message a sentence at a time, then one bold question, then reply chips (a `data-replies` part), so the format holds on any model.
2. In parallel, the user's latest message is parsed into structured answers (website, goals, business), each backed by a quote from the user, and written to `workspaces.entry` and the profile Docs.
