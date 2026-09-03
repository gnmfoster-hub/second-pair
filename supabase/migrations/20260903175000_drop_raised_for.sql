-- Added an hour ago and never read.
--
-- The intent was to remember which business a support conversation belonged
-- to. It turned out the widget route can establish that from the caller's own
-- session on every turn, which is both simpler and safer — nothing is stored,
-- so nothing can go stale or be wrong about who somebody is.
--
-- Dropped rather than left in place. A column nothing writes and nothing reads
-- is a question for whoever finds it next.
alter table conversations drop column if exists raised_for_studio_id;
