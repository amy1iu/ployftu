-- Demo sites seeded with `npm run seed:demo` are pinned: they never expire from
-- the cache, so live demos don't depend on (or wait for) a fresh crawl.
alter table public.crawl_cache add column pinned boolean not null default false;
