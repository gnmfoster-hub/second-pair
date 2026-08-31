-- A session key belongs to one business, not to the whole platform.
--
-- The old unique index was on (channel, external_ref), which made a widget
-- session key globally unique across every business on Handled. Combined with
-- a conversation lookup that did not filter by studio, somebody who chatted
-- with one business and then visited another would resume the first
-- conversation — and be shown its history.
--
-- Every business embeds the widget from the same origin, so they all share one
-- browser storage area, which is exactly how the same key reaches two of them.
--
-- Three things had to change together: the key is now scoped per business in
-- the browser, the lookup filters by studio, and this index stops the database
-- from ever allowing the old shape again.

drop index if exists conversations_channel_ref_key;

create unique index conversations_studio_channel_ref_key
  on conversations (studio_id, channel, external_ref)
  where external_ref is not null;
