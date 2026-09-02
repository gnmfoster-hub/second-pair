-- Who answers an enquiry: the owner, or their second pair of hands.
--
-- Deliberately not an on/off switch. Silence is the one failure this product
-- exists to prevent, and a switch somebody forgets to turn back on produces
-- exactly that on the day they were too busy to notice. Every setting here is
-- bounded, including the manual override, which carries an expiry rather than
-- a state.

alter table studios
  add column if not exists answering_mode text not null default 'when_free'
    check (answering_mode in ('always', 'when_free', 'always_ask_me')),

  -- How long a head start the owner gets on anything that can wait. Clamped
  -- again in code, because a large number here would be an off switch wearing
  -- a disguise.
  add column if not exists first_refusal_minutes int not null default 5
    check (first_refusal_minutes between 1 and 60),

  -- "I've got this", with an end time. Null means it is not in force.
  add column if not exists mine_until timestamptz;

comment on column studios.answering_mode is
  'always = reply at once; when_free = owner gets first refusal while free and open; always_ask_me = first refusal on everything that can wait';

-- When the assistant should step in, if the owner has not answered by then.
alter table conversations
  add column if not exists hold_until timestamptz;

comment on column conversations.hold_until is
  'The assistant is holding back for the owner until this moment. Cleared once it answers or the owner does.';

-- The sweep looks for held conversations that are due. Small and very hot.
create index if not exists conversations_hold_until_idx
  on conversations (hold_until)
  where hold_until is not null;
