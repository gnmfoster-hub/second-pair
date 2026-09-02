-- What a business has actually been sold.
--
-- Seats were the first of these; channels are the second, and there will be
-- more. Each one is something a customer might want, might not, and might
-- reasonably be charged differently for — so none of them can be a thing an
-- owner simply switches on for themselves.
--
-- Default is the web widget only. It is the one that costs nothing extra to
-- run, it is what every business gets on day one, and it means a new account is
-- immediately useful without anybody having authorised anything.
alter table studios
  add column if not exists channels_allowed text[] not null default array['web'];

comment on column studios.channels_allowed is
  'Channels this business is authorised to use. Enforced when a message arrives and in their settings. web costs nothing; sms, email and the Meta channels are chargeable.';

-- Everything that exists today keeps working: they were all using the web
-- widget and nothing else, so this is what they already had.
update studios set channels_allowed = array['web'] where channels_allowed is null;
