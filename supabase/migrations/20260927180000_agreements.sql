-- What a business has agreed to, and what they signed to agree it.
--
-- Plain ASCII throughout, on purpose. The first version of this file used box
-- drawing in the comments, pound signs, and inline "check (col >= 0)" on the
-- money columns. Pasted into the Supabase SQL editor on 29 September it came
-- back as: syntax error at or near "setup_fee_pence", with the editor showing
-- that line as "integer not null default 0)," - the middle of the check clause
-- gone. Which character did it was never established, and establishing it is
-- worth less than removing every candidate: a file that has to survive a
-- clipboard and a browser text area has no business containing anything but
-- ASCII. The checks are named table constraints at the bottom now, where they
-- are also easier to read and to drop.
--
-- Why a table rather than columns on studios
-- ------------------------------------------
--
-- studios already carries plan, plan_pence, billing_started_on and
-- trial_ends_on, and the obvious move is to add a set-up fee and a notice
-- period beside them. That is wrong for the one reason that matters here: a
-- column holds what is true now, and an agreement is a thing that was true on
-- a date and was signed.
--
-- A business on 20 pounds a month who moves to 35 next year has two
-- agreements, and the first one does not stop having existed. Overwriting a
-- price would erase what somebody put their name to, which is the only part of
-- this with any weight.
--
-- So: one row per agreement, frozen at the moment it is sent, exactly the way
-- client_forms freezes the questions on a consent form. The live studio
-- columns stay as they are and go on describing what is true today.
--
-- Bespoke by default
-- ------------------
--
-- No plans, no tiers. Every figure is per agreement, because that is how these
-- are actually sold: a set-up fee here, a trial there, a website on its own
-- for somebody who does not want an assistant at all. A tier list would be a
-- guess at a shape the business does not have yet, and the first client who
-- did not fit would be a schema change.
--
-- Safe to run twice. Every statement says "if not exists".

create table if not exists agreements (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,

  -- What it costs. Once at the start, then every period after that.
  -- Nought where there is no set-up fee, which is most of them.
  setup_fee_pence   integer not null default 0,
  recurring_pence   integer not null default 0,

  -- How often that recurs. Monthly unless somebody wants a year up front.
  period            text not null default 'monthly',

  -- Free until this date. Null means no trial, which is the usual answer.
  trial_ends_on     date,

  -- What they are buying. Free text rather than an enum: "website" and
  -- "assistant" are the two today, and the third will arrive before anybody
  -- remembers to add it to a type. What is on the agreement is what was sold.
  includes          text[] not null default '{}',

  -- How it ends. Sixty days unless a particular agreement says otherwise,
  -- stored per agreement because it is a term and terms are what this is for.
  notice_days       integer not null default 60,

  -- When notice was actually given, and the day it therefore runs to. Both
  -- null until somebody gives notice. The second is worked out from the first
  -- and written down, so it cannot drift if the term is ever changed.
  notice_given_on   date,
  ends_on           date,

  -- The document: the exact wording as sent, never read from a template again.
  -- This is the whole value of a signed thing. Editing the terms next March
  -- must not change what somebody agreed to this September.
  terms_version     text not null,
  terms_text        text not null,

  -- Sending and signing. The token is the private link: long and random, and
  -- whoever holds it can sign, which is the point and nothing else.
  token             text unique,
  sent_to           text,
  sent_at           timestamptz,
  opened_at         timestamptz,

  signed_at         timestamptz,
  signer_name       text,
  signer_email      text,
  -- The drawn signature as a small PNG data URL, as on a consent form.
  signature         text,
  signer_ip         text,
  signer_agent      text,

  -- Withdrawn before signing, or replaced by a later one.
  void_at           timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The guards, named and separate. Money is never negative, and a period is one
-- of three words. Added this way round rather than inline so the file has no
-- punctuation in it that a browser text area might object to.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agreements_setup_fee_not_negative') then
    alter table agreements add constraint agreements_setup_fee_not_negative check (setup_fee_pence >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agreements_recurring_not_negative') then
    alter table agreements add constraint agreements_recurring_not_negative check (recurring_pence >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agreements_notice_not_negative') then
    alter table agreements add constraint agreements_notice_not_negative check (notice_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agreements_period_known') then
    alter table agreements add constraint agreements_period_known check (period in ('monthly', 'quarterly', 'yearly'));
  end if;
end $$;

create index if not exists agreements_studio on agreements (studio_id, created_at desc);
create index if not exists agreements_token on agreements (token) where token is not null;

comment on table agreements is
  'One row per agreement sent to a business, frozen at the moment it is sent. The live studio columns say what is true today; these say what was signed, and when, and by whom.';

comment on column agreements.terms_text is
  'The terms exactly as sent. Never re-read from a template: editing the wording later must not change what somebody already agreed to.';

comment on column agreements.notice_days is
  'How much notice to cancel, in days. Sixty by default. Stored per agreement because it is a term of that agreement rather than a setting.';

comment on column agreements.ends_on is
  'The day the agreement actually runs to, worked out from notice_given_on and written down rather than recomputed, so changing the term later cannot silently move a date somebody was given.';

-- Nobody reads these through the browser except the person signing one, who
-- reaches it by token on a public page and is not signed in. Everything else
-- is the back office with the service key.
alter table agreements enable row level security;
