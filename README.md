# Onboarding Agent

An agentic first-time-user experience: a chat that learns what a new user wants and recommends products/workflows.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Vercel AI SDK 7 · Vercel AI Gateway · Supabase

## Setup

```bash
cp .env.example .env.local   # fill in keys
npm run dev
```

- **AI Gateway:** set `AI_GATEWAY_API_KEY`, or run `vercel link && vercel env pull` to use OIDC. Change models via `AI_MODEL`.
- **Supabase:** set `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then apply `supabase/migrations/` (`npx supabase link && npx supabase db push`, or paste into the SQL editor).

## Layout

| Path | Purpose |
| --- | --- |
| `src/app/api/chat/route.ts` | Streams the agent via AI Gateway; saves conversations for signed-in users |
| `src/lib/ai/agent.ts` | Model, system prompt, tools (`recommendProducts`), message types |
| `src/lib/ai/catalog.ts` | Placeholder product/workflow catalog |
| `src/components/app-shell.tsx` | Page shell: left rail + main area |
| `src/components/sidebar/` | Left rail; tabs defined in `nav-config.ts` (mocked, no navigation yet) |
| `src/components/onboarding-chat.tsx` | Chat screen (`useChat`) with the opening greeting |
| `src/components/chat/` | Header, message rendering (incl. recommendation cards), composer |
| `src/lib/mock-data.ts` | Placeholder user/workspace/sites/ploys until auth is wired up |
| `src/lib/supabase/*` | Browser, server, and proxy Supabase clients |
| `src/proxy.ts` | Refreshes the Supabase session on each request |
| `supabase/migrations/` | `onboarding_conversations` table with RLS |
