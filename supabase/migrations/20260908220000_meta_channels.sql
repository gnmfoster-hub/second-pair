-- The credentials a Meta channel needs, kept out of reach.
--
-- A WhatsApp number or a Facebook page is connected by handing us a token that
-- can send messages as that business. It is a password in every way that
-- matters, and channel_connections is readable by everybody on the team —
-- which is right for a phone number and wrong for this.
--
-- So it lives in its own table with no client access at all. No policy is
-- granted, so with row-level security on, every ordinary session sees nothing
-- here whatever it asks for. Only the server, holding the service key, reads
-- it — and the only thing that ever needs to is the code that sends a message.
create table if not exists channel_secrets (
  connection_id uuid primary key
    references channel_connections(id) on delete cascade,

  -- Long-lived page or WhatsApp token. Rotated by reconnecting.
  access_token  text not null,

  -- Which Meta app issued it, so a token from an old app is recognisable
  -- rather than merely broken.
  app_id        text,

  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table channel_secrets enable row level security;

-- Deliberately no policies. See above: the service key bypasses row-level
-- security, and nothing else has any business reading a token.

comment on table channel_secrets is
  'Meta access tokens. No RLS policies on purpose: server-side reads only, never the browser.';
comment on column channel_secrets.access_token is
  'A credential. Never send this to a client, never log it, never put it in an error.';
