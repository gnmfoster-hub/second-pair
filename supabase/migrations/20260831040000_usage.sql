-- What each reply costs.
--
-- Recorded per assistant message so cost per conversation, per booking and per
-- studio are all answerable — which matters when the subscription has to cover
-- it, and which is the only way to tell whether an optimisation worked.

alter table messages
  add column usage jsonb;

comment on column messages.usage is
  'Token counts and cost for the turn: input, output, cache_read, cache_write, cost_micros.';
