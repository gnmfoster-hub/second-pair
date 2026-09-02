-- Who an answer is for.
--
-- Almost every business has one audience — its customers — and this stays null
-- for all of them. It exists for the support assistant, which takes questions
-- from owners who already pay and from people deciding whether to, and needs to
-- offer each of them a different first tap.
--
-- The alternative was guessing from the wording, and guessing put
-- "How do I sign up?" in front of somebody who had already signed up.
alter table faqs
  add column if not exists audience text
    check (audience in ('visitor', 'owner'));

comment on column faqs.audience is
  'visitor = deciding whether to buy, owner = already has an account, null = everyone';
