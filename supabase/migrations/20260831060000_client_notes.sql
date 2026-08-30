-- Notes a business keeps about a client: allergies, how they take their tea,
-- who not to sit them next to. Kept apart from the enquiry, because they
-- outlive any one appointment.
alter table contacts
  add column notes text,
  -- Flagged in the diary and to the assistant. For anything that must be seen
  -- before they are booked again.
  add column alert text;

comment on column contacts.alert is
  'Shown prominently wherever this client appears. For things that must not be missed.';

create index contacts_search_idx on contacts (studio_id, name);
