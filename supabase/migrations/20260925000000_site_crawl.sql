-- Progress and results of reading the user's website (phase 2). Lives on the
-- workspace row so the chat's site card updates over Realtime.
-- Shape: src/lib/site/types.ts (SiteCrawl).
alter table public.workspaces add column crawl jsonb;
