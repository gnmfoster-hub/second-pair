-- Is this a customer, a demonstration, or us?
--
-- Without this every figure on the back office counted all three together:
-- two real businesses, eight demos, four bits of test junk and Second Pair's
-- own support studio, presented as "15 businesses". A number somebody is going
-- to quote at a prospect has to be true, and that one was not.
--
-- Three kinds rather than a delete-it-all, because a demo is worth keeping. It
-- is what you show somebody on a call, and deleting it to tidy a total would
-- be losing something useful to fix a counting problem.
alter table studios
  add column if not exists kind text not null default 'customer'
    check (kind in ('customer', 'demo', 'internal'));

comment on column studios.kind is
  'customer counts in the figures and the attention list; demo is for showing people; internal is Second Pair''s own.';

-- Second Pair's support studio is not a customer of itself.
update studios set kind = 'internal' where slug = 'help';

-- Anything that names itself a demo or a test was never a customer. Done by
-- name rather than by hand so it stays right if these are recreated.
update studios set kind = 'demo'
where kind = 'customer'
  and (slug like 'demo-%' or slug like 'test-%' or slug like '%-test-%'
       or name ilike '%test%' or slug like 'lc-test%' or slug like 'invite-test%');
