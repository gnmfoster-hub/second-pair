-- Who put this in the diary, and what has happened to it since.
--
-- RUN THIS IN THREE PIECES, one at a time, in order.
--
-- Not a style choice. The Supabase SQL editor truncates a paste at about a
-- thousand characters, which is written up at length in the agreements
-- migration. Every statement below is well under a third of that, each is
-- safe to run twice, and each does something whole.
--
--
-- Why this exists
-- ---------------
--
-- Giles, 15 October, about a walk in Amber's diary: "Julie is saying she went
-- on something and booked. We don't know if this is correct, and Amber says
-- she didn't book the Wed 14th appointment."
--
-- Both of them were telling the truth. Julie booked Tuesday the 13th herself,
-- through the widget, and the assistant took it. The Wednesday one was typed
-- in by hand two days later. The database could prove the first and could say
-- nothing at all about the second beyond "a person did this", because nothing
-- records WHICH person.
--
-- For a one-woman dog walking business that is a curiosity. For a dealer
-- group with sales staff across several sites, "who booked this" is the first
-- question a manager asks, and "who cancelled it" is the one people argue
-- about. Better to have it before that is built than to retrofit it.
--
--
-- Why a table and not just a column
-- ---------------------------------
--
-- created_by alone answers one question once. It cannot say who moved an
-- appointment, who changed its price, or who cancelled it, and those are the
-- changes that cost somebody money or a Saturday morning.
--
-- A column holds what is true now. A history holds what happened, which is a
-- different thing and the one being asked for.


-- 1 of 3. Who made it.
-- Nullable for ever: every booking already in the diary predates this, the
-- assistant's bookings are made by nobody, and a null that means "we do not
-- know" is honest where a default would be a guess.
alter table bookings
  add column if not exists created_by uuid,
  add column if not exists created_by_name text;


-- 2 of 3. What has happened to it.
-- by_name is frozen at the time rather than joined later, so the history still
-- reads correctly after somebody leaves and their row is deleted or renamed.
create table if not exists booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  at timestamptz not null default now(),
  what text not null,
  by_user uuid,
  by_name text,
  source text,
  detail jsonb
);


-- 3 of 3. Reading it back, and locking it down.
-- Row level security on with no policy, as with agreements: nothing reads this
-- through the browser. The diary is the back office and uses the service key.
create index if not exists booking_events_for_booking
  on booking_events (booking_id, at desc);

alter table booking_events enable row level security;
