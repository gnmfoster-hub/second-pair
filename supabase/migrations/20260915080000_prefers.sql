-- Which way somebody would rather be reached.
--
-- The product decides for itself today: a text first, because a text gets read
-- and an email gets read eventually. That is the right default and it is not a
-- reason to text somebody who has asked to be emailed — which is a thing
-- people ask, and a thing a business promises at the desk and then cannot
-- keep.
--
-- Null is the ordinary case and means the default order. A stated preference
-- only reorders what is already possible: it never invents an address and
-- never hides one, so somebody who prefers email and gives only a mobile is
-- still reachable.

alter table contacts
  add column if not exists prefers text
    check (prefers is null or prefers in ('sms', 'email'));

comment on column contacts.prefers is
  'Which way this person would rather be reached. Null means no preference, which is most people.';
