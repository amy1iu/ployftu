-- Single-user demo schema. There is no auth: every row carries a constant
-- demo user_id so the shape matches a real multi-user setup later.
-- One workspace = one business = one onboarding run ("Start fresh" makes a new one).

drop table if exists public.onboarding_conversations;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null default 'New workspace',
  website_url text,
  logo_url text,
  favicon_url text,
  brand_color text,
  -- Answers to the two entry questions (website, goals). See src/lib/onboarding/entry.ts.
  entry jsonb not null default '{"website":{"status":"unknown","url":null},"goals":{"status":"unknown","intents":[],"inUserWords":null,"unmatched":null}}'::jsonb,
  onboarding_status text not null default 'active'
    check (onboarding_status in ('active', 'completed', 'skipped')),
  is_eval boolean not null default false,
  created_at timestamptz not null default now(),
  last_opened_at timestamptz not null default now()
);

-- Markdown docs: the business profile (source of truth for every agent) and deliverables.
create table public.docs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  slug text not null,
  title text not null,
  kind text not null check (kind in ('profile', 'deliverable')),
  content_md text not null default '',
  -- Per-section bookkeeping: { [sectionKey]: { status, source, updatedAt } }
  sections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

-- A ploy is a chat. Getting Started is kind 'onboarding'; tasks carry a Ploybook spec.
create table public.ploys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  kind text not null check (kind in ('onboarding', 'task')),
  title text not null,
  spec jsonb,
  status text not null default 'idle' check (status in ('idle', 'running', 'done', 'live')),
  messages jsonb not null default '[]'::jsonb,
  unread boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index ploys_one_onboarding_per_workspace
  on public.ploys (workspace_id) where kind = 'onboarding';
create index ploys_workspace_id_idx on public.ploys (workspace_id);

-- Map levels. State (locked/available/running/done/live) is derived from the
-- linked ploy + integrations, never stored, so it can't drift from the ploys.
create table public.map_nodes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  spec_id text not null,
  region text not null,
  slot int not null,
  title text not null,
  blurb text not null,
  reason text,
  emphasized boolean not null default false,
  ploy_id uuid unique references public.ploys (id) on delete set null,
  revealed_at timestamptz not null default now(),
  unique (workspace_id, spec_id)
);

create table public.integrations (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  provider text not null,
  connected_at timestamptz not null default now(),
  primary key (workspace_id, provider)
);

create table public.crawl_cache (
  url text primary key,
  pages jsonb not null,
  branding jsonb,
  fetched_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  user_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_workspace_id_idx on public.events (workspace_id, created_at);

-- Writes go through the server with the secret key (bypasses RLS). The browser
-- only reads, for Realtime. Demo-only: anyone with the publishable key can read.
alter table public.workspaces enable row level security;
alter table public.docs enable row level security;
alter table public.ploys enable row level security;
alter table public.map_nodes enable row level security;
alter table public.integrations enable row level security;
alter table public.crawl_cache enable row level security;
alter table public.events enable row level security;

create policy "Demo read" on public.workspaces for select to anon using (true);
create policy "Demo read" on public.docs for select to anon using (true);
create policy "Demo read" on public.ploys for select to anon using (true);
create policy "Demo read" on public.map_nodes for select to anon using (true);
create policy "Demo read" on public.integrations for select to anon using (true);

alter publication supabase_realtime
  add table public.workspaces, public.docs, public.ploys, public.map_nodes, public.integrations;
