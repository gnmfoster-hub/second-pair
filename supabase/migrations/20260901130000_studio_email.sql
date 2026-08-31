-- Where a customer's reply should go.
--
-- Email has to be sent from a domain we have verified, so the From line is
-- ours. Without a reply-to, a customer answering a booking confirmation writes
-- back to an address nobody at the salon can read, and their message is gone.
--
-- Backfilled from whoever owns the business, because that is the address they
-- already gave us and almost always the right one. They can change it.

alter table studios
  add column email text;

comment on column studios.email is
  'Where replies to emails we send on the business''s behalf should go. Also shown to customers as the way to reach them.';

update studios s
   set email = u.email
  from studio_members m
  join auth.users u on u.id = m.user_id
 where m.studio_id = s.id
   and m.role = 'owner'
   and s.email is null;
