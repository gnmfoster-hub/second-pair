-- What arrived at an inbound address, and what we decided about it.
--
-- Setting a business up means pointing their real mailbox at an address of
-- ours, and every provider confirms that by emailing a code to the
-- destination. When it does not turn up there are three possible reasons —
-- it never arrived, it arrived and was thrown away as a machine talking, or
-- the address named a business that does not exist — and until now they were
-- indistinguishable from the outside, because the two that reach us leave no
-- trace at all.
--
-- That is on purpose for a newsletter: parking one puts it in the inbox every
-- Tuesday until the inbox is worth nothing. But "we ignored it" is a fact
-- worth keeping for a fortnight, in a place that is ours rather than theirs.

create table if not exists inbound_emails (
  id          uuid primary key default gen_random_uuid(),

  -- Null when the address named no business we know, which is itself the
  -- answer to "why did nothing happen" — usually a slug typed wrong.
  studio_id   uuid references studios(id) on delete cascade,

  to_address   text,
  from_address text,
  subject      text,

  -- answered, parked, ignored, or refused before we got that far.
  verdict     text not null,
  -- In the words the rule itself used, so this reads as an explanation.
  because     text,

  at          timestamptz not null default now()
);

create index if not exists inbound_emails_recent on inbound_emails (at desc);
create index if not exists inbound_emails_studio on inbound_emails (studio_id, at desc);

/*
 * No policies, deliberately.
 *
 * Row-level security on and nothing granted means no browser session can read
 * this however it asks — the same arrangement the early-access list uses. It
 * holds the subject lines of mail sent to businesses on here, which is theirs
 * and not other customers' to read, and the only thing that touches it is a
 * webhook holding the service key.
 */
alter table inbound_emails enable row level security;

comment on table inbound_emails is
  'Every email that reached an inbound address and what was decided about it. Ours, for support. Service key only.';
