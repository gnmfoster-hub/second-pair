-- A conversation may outlive the person it was with.
--
-- Erasing a client deleted every appointment they had ever had. Not by
-- intention — the code says plainly that the appointments stay and the
-- accounts still add up — but by cascade: a booking belongs to an enquiry,
-- an enquiry to a conversation, and a conversation to a contact, so removing
-- the contact at the end of it took a day's work and the money out of the
-- diary with them. A £300 job simply disappeared.
--
-- Erasure has to be possible and the business's record of work done has to
-- survive it. Both are true only if a conversation can go on existing with
-- nobody attached: the words in it are deleted, everything identifying is
-- cleared, and what is left is an appointment on a date for an amount, which
-- is no longer anybody's personal data.
alter table conversations
  alter column contact_id drop not null;

comment on column conversations.contact_id is
  'Null once the client has been erased. The thread is emptied and anonymised rather than deleted, so the appointments it produced stay in the diary.';
