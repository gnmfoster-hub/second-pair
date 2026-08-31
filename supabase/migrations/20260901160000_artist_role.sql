-- What this person actually does.
--
-- The trade packs have carried a list of roles for a while — a tattoo studio
-- has a piercer, a salon has a nail technician, a plumbing firm has a gas
-- engineer — and there was nowhere to put the answer. So the assistant could
-- not say "Sarah does the colour work, Tom does cuts", and a client asking for
-- a piercing got offered whoever was free.
--
-- Free text rather than a lookup table on purpose. The packs suggest the usual
-- ones, but a business that calls somebody a "creative director" should be able
-- to type it, and a list we control would be a list we have to keep arguing
-- with.

alter table artists
  add column role text;

comment on column artists.role is
  'What this person does, in the business''s own words. Suggested from the trade pack; anything may be typed.';
