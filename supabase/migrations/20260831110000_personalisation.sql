-- Making the assistant sound like this business, not like software.
--
-- Tone of voice already exists, but describing a manner only gets you so far.
-- What actually teaches somebody's voice is seeing them answer something — so
-- the strongest field here is the examples: a real question, and the reply the
-- owner would have typed themselves.
--
-- All of this lives on `studios` rather than in a table of its own because it
-- is one row per business, always read together, and it belongs in the cached
-- half of the prompt.

alter table studios
  -- Worked in when it is relevant, never recited. "Parking is free after six."
  add column always_mention  text[] not null default '{}',

  -- Hard don'ts, in their words. "Never say we do walk-ins."
  add column never_mention   text[] not null default '{}',

  -- Extra things that should reach a human, on top of the built-in ones.
  add column escalate_when   text[] not null default '{}',

  -- [{ "ask": "...", "reply": "..." }] — how they would answer, in their words.
  add column voice_examples  jsonb  not null default '[]';

comment on column studios.voice_examples is
  'Question and answer pairs showing how this business writes. Few-shot examples for the assistant''s voice.';

comment on column studios.always_mention is
  'Facts to work in where relevant. Not a script to recite.';
