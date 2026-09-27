-- When the widget was last actually loaded on a business's own website.
--
-- Not run yet. Both columns are nullable and absent means "never seen", which
-- is what every business reads as today.
--
-- ── What is wrong without it ────────────────────────────────────────────────
--
-- The "Is it working?" page tells a business whether the assistant is live on
-- their website. It decided that by counting rows in channel_connections —
-- and there has never been a web row for anybody, because the widget is served
-- from us and needs nothing connecting. So the only way that line could ever
-- go green was for a customer to actually use the chat.
--
-- Which means a business that has installed the code correctly, and is waiting
-- for their first enquiry, is told the code is not on their website. The one
-- state where somebody needs reassurance is the state that gets a red cross.
--
-- Giles, looking at Amber's Paws & Pastures on 27 September: "it says not live
-- on a website when it is." Her site carries the script with her own slug on
-- it; her web chat had never been used; the page called it not installed.
--
-- ── Why this signal and not a fetch ─────────────────────────────────────────
--
-- The obvious alternative is to go and fetch their homepage and look for the
-- tag. That fails quietly in all the ordinary ways: the widget may be on a
-- contact page rather than the front one, the site may sit behind Cloudflare
-- or a login, and a slow site would hang a settings screen.
--
-- The widget tells us itself. It asks /api/widget/status before a visitor has
-- typed anything, every time it loads. That request is proof of exactly the
-- thing being claimed — the code is on a page, and somebody has opened that
-- page. Nothing else we could measure is closer to the question.
--
-- Written at most once an hour per business, because this endpoint is hit by
-- every visitor to every customer's website and a row write per page view is
-- a cost with no reader.

alter table studios
  add column if not exists widget_seen_at timestamptz;

alter table studios
  add column if not exists widget_seen_on text;

comment on column studios.widget_seen_at is
  'When the widget last loaded on a page somebody opened. Proof the code is installed, which counting connections could never be — there is no web connection row for anybody. Written at most hourly.';

comment on column studios.widget_seen_on is
  'The website it was last seen on, from the request origin. Shown back to the business so "on your site" names the site, and so a slug pasted on the wrong domain is visible rather than silently counted.';
