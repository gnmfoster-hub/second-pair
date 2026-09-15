-- Numbers that have texted STOP to a business.
--
-- A customer replying STOP was answered by the assistant like any other
-- message, and nothing remembered it — so reminders and offers kept going to
-- somebody who had asked them to stop, which is both rude and against the
-- rules every business sending texts in the UK is held to.
--
-- Per business, because STOP to a salon is not STOP to the cleaner they also
-- use. Keyed on the number in one shape (+44…), because contact records hold
-- numbers however they were typed and a STOP has to catch all of them.

create table if not exists sms_opt_outs (
  studio_id  uuid not null references studios(id) on delete cascade,
  phone      text not null,
  created_at timestamptz not null default now(),
  primary key (studio_id, phone)
);

alter table sms_opt_outs enable row level security;

-- Members can see who has opted out (so the inbox can say so); only the
-- server writes, from the text webhook.
drop policy if exists sms_opt_outs_read on sms_opt_outs;
create policy sms_opt_outs_read on sms_opt_outs for select
  using (is_studio_member(studio_id));

comment on table sms_opt_outs is
  'Numbers that texted STOP to this business. Nothing is texted to them until they text START.';
