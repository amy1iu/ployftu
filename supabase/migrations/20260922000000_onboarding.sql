-- Stores each user's onboarding chat (AI SDK UIMessage[] as JSON).
create table public.onboarding_conversations (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_conversations_user_id_idx
  on public.onboarding_conversations (user_id);

alter table public.onboarding_conversations enable row level security;

create policy "Users manage their own conversations"
  on public.onboarding_conversations
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
