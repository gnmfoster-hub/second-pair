-- Who the assistant may offer, as opposed to who has a diary.
--
-- "Active" was doing two jobs: whether somebody works here, and whether a
-- customer may be offered them. An electrician taking on an apprentice wants
-- the apprentice in the diary — they take the work he hands them — and does
-- not want a stranger asking the website for somebody to come out and being
-- given the apprentice. The only way to say that was to make them inactive,
-- which takes their diary away too.
--
-- Defaults to true, so every business behaves exactly as it did.

alter table artists
  add column if not exists assistant_books boolean not null default true;

comment on column artists.assistant_books is
  'Whether the assistant may offer and book this person, on any channel. False keeps their diary and takes them off the channels.';
