-- The first line a customer reads.
--
-- The trade pack supplies a sensible default, but this is the business's own
-- shop window and they should be able to write it. Null means "use the pack's",
-- so an existing business is not forced to have an opinion and a new trade pack
-- can improve the wording for everyone who never changed it.

alter table studios
  add column greeting text;

comment on column studios.greeting is
  'Opening line in the chat widget. Null falls back to the trade pack greeting.';
