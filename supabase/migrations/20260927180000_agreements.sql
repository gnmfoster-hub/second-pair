-- What a business has agreed to, and what they signed to agree it.
--
-- RUN THIS IN FIVE PIECES, one at a time, in order.
--
-- Not a style choice. Pasted into the Supabase SQL editor on 29 September it
-- failed twice, both times at line 33, and both times with the line cut off in
-- the middle of a word:
--
--   syntax error at or near "setup_fee_pence"   ... default 0),
--   syntax error at or near "def"               ... not null def
--
-- Measured rather than guessed at the third attempt: it stopped at 937
-- characters of a 1006 character statement. Something between the clipboard and
-- the editor truncates at about a thousand. The first fix - stripping the file
-- to plain ASCII - was a reasonable guess and the wrong one, because the fault
-- was never a character, it was a length.
--
-- So every statement below is about a third of that limit, each is safe to run
-- twice, and each does something whole. If one ever fails again, only that piece
-- has to be split.
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
-- agreements, and the first does not stop having existed. Overwriting a price
-- would erase what somebody put their name to, which is the only part of this
-- with any weight.
--
-- Bespoke by default
-- ------------------
--
-- No plans, no tiers. Every figure is per agreement, because that is how these
-- are actually sold: a set-up fee here, a trial there, a website on its own for
-- somebody who does not want an assistant at all.


-- 1 of 5. The table.
create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- 2 of 5. What it costs, and what they are buying.
-- includes is free text rather than an enum: "website" and "assistant" are the
-- two today, and the third will arrive before anybody remembers to add it to a
-- type. What is on the agreement is what was sold.
alter table agreements
  add column if not exists setup_fee_pence integer not null default 0,
  add column if not exists recurring_pence integer not null default 0,
  add column if not exists period text not null default 'monthly',
  add column if not exists trial_ends_on date,
  add column if not exists includes text[] not null default '{}';


-- 3 of 5. How it ends, and the document itself.
--
-- terms_version and terms_text are nullable here where the single-statement
-- version had them not null. That is what splitting costs: a column added to an
-- existing table cannot be not null without a default, and a default for the
-- wording of an agreement would be a lie sitting in a column. Nothing is weaker
-- in practice - both are always written when one is created, and an agreement
-- with no wording could never be sent because there would be nothing to send.
-- Recorded rather than glossed over, because a schema that differs from the file
-- it came from is how a surprise gets buried.
--
-- terms_text is the exact wording as sent, never read from a template again.
-- That is the whole value of a signed thing: editing the wording next March
-- must not change what somebody agreed to this September.
-- ends_on is written down rather than recomputed, so changing the notice period
-- later cannot silently move a date somebody was already given.
alter table agreements
  add column if not exists notice_days integer not null default 60,
  add column if not exists notice_given_on date,
  add column if not exists ends_on date,
  add column if not exists terms_version text,
  add column if not exists terms_text text;


-- 4 of 5. Sending it.
-- The token is the private link: long and random, and whoever holds it can
-- sign, which is the point and nothing else.
alter table agreements
  add column if not exists token text unique,
  add column if not exists sent_to text,
  add column if not exists sent_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists signed_at timestamptz,
  add column if not exists signer_name text,
  add column if not exists signer_email text;


-- 5 of 5. Signing it, and the rest.
-- signature is the drawn one as a small PNG data URL, as on a consent form.
-- void_at is withdrawn before signing, or replaced by a later one.
-- Row level security is on with no policy: nobody reads these through the
-- browser except the person signing, who arrives by token on a public page and
-- is not signed in. Everything else is the back office with the service key.
alter table agreements
  add column if not exists signature text,
  add column if not exists signer_ip text,
  add column if not exists signer_agent text,
  add column if not exists void_at timestamptz;

create index if not exists agreements_studio on agreements (studio_id, created_at desc);
alter table agreements enable row level security;


-- Optional, and only worth running once the five above have gone through.
-- Guards rather than behaviour: money is never negative and a period is one of
-- three words. Nothing in the product depends on them.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agreements_money_sane') then
    alter table agreements add constraint agreements_money_sane
      check (setup_fee_pence >= 0 and recurring_pence >= 0 and notice_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agreements_period_known') then
    alter table agreements add constraint agreements_period_known
      check (period in ('monthly', 'quarterly', 'yearly'));
  end if;
end $$;
