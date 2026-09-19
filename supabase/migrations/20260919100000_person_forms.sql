-- A form one person needs before a service, where the business as a whole
-- does not.
--
-- services.requires_form_id already sends a form when somebody books: a patch
-- test before colour, a consent before a tattoo. It belongs to the business,
-- so it applies to everybody who does that service — and that is not how a
-- team works. One stylist wants a patch test before every colour; the one at
-- the next chair has been doing it twenty years and asks at the consultation.
-- One tattooist wants a health questionnaire for a cover-up; another does not.
--
-- service_people already holds what one person charges and how long they take
-- for a service, which makes it exactly the right place for what they require
-- before it.
--
-- The rule is that a person can add a requirement, never remove one. If the
-- business says colour needs a patch test, nobody on the team can quietly
-- decide otherwise — that is a safety decision and it belongs to whoever runs
-- the place. The person's own setting only ever applies on top.

alter table service_people
  add column if not exists requires_form_id uuid references form_templates(id) on delete set null;

-- Why they ask for it, in their own words, so the assistant can tell the
-- customer something better than "a form is required". Shown to the customer,
-- so it is written as a reason and not as a note to the office.
alter table service_people
  add column if not exists form_reason text;

-- The same, for the business-wide requirement, which had no way to explain
-- itself either.
alter table services
  add column if not exists form_reason text;

comment on column service_people.requires_form_id is
  'A form this person needs signed before this service, on top of any the business requires.';
comment on column service_people.form_reason is
  'Why, in words a customer reads. Optional.';
comment on column services.form_reason is
  'Why the business requires its form, in words a customer reads. Optional.';
