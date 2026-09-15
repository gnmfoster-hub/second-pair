-- Forms: consents, waivers, questionnaires and quotes, sent to a customer,
-- filled in and signed on their own phone, and kept against their record.
--
-- Two tables, on purpose. A template is what the business writes and keeps
-- changing. A client form is one copy sent to one person, and it carries its
-- own frozen copy of the questions — so editing a consent form in March never
-- changes what somebody agreed to in January. That frozen copy is the whole
-- value of a signed form.
--
-- Paper forms live in the second table too: a photo or a PDF of something
-- signed at the desk, with no questions and a file instead.

create table if not exists form_templates (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references studios(id) on delete cascade,
  name        text not null,
  -- What it is for, which decides nothing but helps a list read.
  kind        text not null default 'consent'
                check (kind in ('consent', 'questionnaire', 'waiver', 'quote', 'other')),
  -- Paragraphs, questions, a tick to agree, a signature. See src/lib/forms/blocks.ts.
  blocks      jsonb not null default '[]'::jsonb,
  -- Where it came from, when it started as one of ours.
  starter     text,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists form_templates_studio on form_templates (studio_id, active, sort_order);

create table if not exists client_forms (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references studios(id) on delete cascade,
  contact_id   uuid not null references contacts(id) on delete cascade,
  template_id  uuid references form_templates(id) on delete set null,
  booking_id   uuid references bookings(id) on delete set null,

  title        text not null,
  -- The questions exactly as sent. Never read from the template again.
  blocks       jsonb not null default '[]'::jsonb,
  answers      jsonb,

  status       text not null default 'sent'
                 check (status in ('sent', 'opened', 'signed', 'paper', 'void')),

  -- The private link. Long and random; whoever holds it can fill the form in,
  -- which is the point, and nothing else.
  token        text unique,
  expires_at   timestamptz,

  sent_via     text,
  sent_at      timestamptz,
  opened_at    timestamptz,
  signed_at    timestamptz,
  signer_name  text,
  -- The drawn signature as a small PNG data URL.
  signature    text,
  signer_ip    text,
  signer_agent text,

  -- A paper form: where the photo or PDF is kept in the forms bucket.
  file_path    text,
  file_name    text,
  file_type    text,

  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists client_forms_contact on client_forms (contact_id, created_at desc);
create index if not exists client_forms_studio on client_forms (studio_id, status, created_at desc);
create index if not exists client_forms_booking on client_forms (booking_id);

-- A service can ask for a form before it is done: a patch test before colour,
-- a consent before a tattoo, a health questionnaire before a first session.
alter table services
  add column if not exists requires_form_id uuid references form_templates(id) on delete set null;

alter table form_templates enable row level security;
alter table client_forms enable row level security;

-- Everybody in the business can see and use forms; only the owner writes them.
create policy form_templates_read on form_templates for select
  using (is_studio_member(studio_id));
create policy form_templates_owner on form_templates for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));

-- Anybody in the business can send a form, add a paper one, and read them.
-- The customer's own page never uses these: it goes through the server with
-- the link's token and the service key.
create policy client_forms_member on client_forms for all
  using (is_studio_member(studio_id))
  with check (is_studio_member(studio_id));

-- Private files, filed under <studio_id>/<contact_id>/<file>.
insert into storage.buckets (id, name, public)
values ('forms', 'forms', false)
on conflict (id) do nothing;

create policy "studio members read forms" on storage.objects
  for select using (
    bucket_id = 'forms'
    and is_studio_member(((storage.foldername(name))[1])::uuid)
  );

create policy "studio members add forms" on storage.objects
  for insert with check (
    bucket_id = 'forms'
    and is_studio_member(((storage.foldername(name))[1])::uuid)
  );

create policy "studio members remove forms" on storage.objects
  for delete using (
    bucket_id = 'forms'
    and is_studio_member(((storage.foldername(name))[1])::uuid)
  );

comment on table client_forms is
  'A form sent to one customer, with its own frozen questions, their answers and signature — or a paper form kept as a file.';
