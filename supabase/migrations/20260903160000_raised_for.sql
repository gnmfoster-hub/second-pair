-- Which business a support conversation belongs to.
--
-- The help assistant is the ordinary widget pointed at Second Pair's own
-- support studio, so every conversation it holds lives in that studio. That is
-- right for the conversation and useless for the request that comes out of it:
-- "somebody cannot get their reminders working" has to land in *their*
-- business, where they will look for the answer.
--
-- Set only from a signed token the dashboard issues, never from anything the
-- browser simply claims. See lib/supportToken.ts.
alter table conversations
  add column if not exists raised_for_studio_id uuid references studios(id) on delete set null;

comment on column conversations.raised_for_studio_id is
  'For support conversations: the business the person asking belongs to, so a request files in the right place.';
