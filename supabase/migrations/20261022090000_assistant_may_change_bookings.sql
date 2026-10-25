-- Letting a customer move or cancel their own appointment.
--
-- One statement. Safe to run twice.
--
-- Giles, 22 October, about Jess at Living Canvas: "she had a booking and
-- contacted to change it, as far as I can see this wasn't an easy process for
-- her." It was not a process at all. The assistant could make a booking and
-- could not touch one afterwards, so every customer who wanted to move or
-- cancel got the same answer: it has been passed on, somebody will confirm.
-- Jess asked twice, on two channels, and nobody ever confirmed it to her.
--
-- On by default, which is the deliberate part. A business that has to be
-- asked to switch this on will not be asked at the moment it matters, and a
-- customer who cannot cancel does not keep the appointment, they simply do
-- not turn up. Off is still there for anybody who wants to hold the diary
-- themselves, and it is in Settings, Assistant where they will find it.

alter table studios
  add column if not exists assistant_may_change_bookings boolean not null default true;
