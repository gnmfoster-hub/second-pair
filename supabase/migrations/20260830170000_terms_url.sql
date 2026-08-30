-- The assistant reads a short deposit policy aloud in chat. Businesses usually
-- also keep a fuller version on their own site, and being able to link it makes
-- the terms accessible without turning the conversation into a legal document.
alter table studios add column terms_url text;

comment on column studios.terms_url is
  'Public page with the full booking and cancellation terms, linked alongside the spoken policy.';
