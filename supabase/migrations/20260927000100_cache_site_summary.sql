-- The summary drafted from a site depends only on the site, so it's cached
-- with the pages; a cache hit (e.g. a pinned demo site) skips summarizing.
alter table public.crawl_cache add column summary jsonb;
