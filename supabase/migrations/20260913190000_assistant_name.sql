-- What the assistant calls itself.
--
-- It currently has no name and opens with the business's, which reads as a
-- form rather than a person and leaves a customer with nothing to say back to.
-- "Thanks Robin" is a different conversation from "thanks" — and a named thing
-- that says plainly it is an assistant is more honest than an unnamed one that
-- somebody quietly assumes is a person.
--
-- Null on the business means the default, which the code supplies rather than
-- the schema: a default written here would have to be changed in two places
-- and would silently stamp itself on every business created before anybody
-- decided what it should be.
alter table studios
  add column if not exists assistant_name text;

comment on column studios.assistant_name is
  'What the assistant introduces itself as. Null uses the product default.';

-- And what it calls itself when it is answering for one person.
--
-- A stylist with her own Instagram is not answered by the shop's assistant;
-- as far as that customer is concerned she has someone helping her. Whose
-- name that is should be hers to pick, for the same reason her tone and her
-- greeting already are.
--
-- Null uses the business's, which uses the default. Two falls, one meaning:
-- nobody has said otherwise.
alter table artists
  add column if not exists assistant_name text;

comment on column artists.assistant_name is
  'What the assistant calls itself on this person''s own enquiries. Null uses the business''s.';
