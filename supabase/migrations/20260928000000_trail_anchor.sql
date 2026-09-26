-- Getting Started is a question trail: each task hangs off the question that
-- revealed it, or the one whose answer it's waiting on (see anchorFor in
-- src/lib/map/plan.ts). Null for tasks placed before the trail existed.
alter table public.map_nodes add column anchor text;
