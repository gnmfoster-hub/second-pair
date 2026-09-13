-- When a channel was last changed.
--
-- A number saved from the back office reappeared nowhere with a date on it, so
-- "did that go in?" could only be answered by reading the number back and
-- trusting your own memory of what you typed. The same reason the settings form
-- grew a last-saved line: a screen that cannot answer that question gets
-- checked twice by careful people and trusted blindly by everybody else.
alter table channel_connections
  add column if not exists updated_at timestamptz not null default now();

comment on column channel_connections.updated_at is
  'When the number or its forwarding was last changed. Shown beside it, so saving is visibly a thing that happened.';
