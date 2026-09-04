-- How the widget looks, kept where the business can change it.
--
-- The colour, the corner and the nudge were all attributes on the script tag,
-- which means they live in the HTML of somebody else's website. To change
-- their own accent colour an owner had to open their site's source, find the
-- line, edit it and republish — or ring us. A salon that rebrands cannot do it
-- from the product they are paying for, which is the wrong way round.
--
-- Held here, the widget asks for it and applies it everywhere at once. The
-- script tag still wins if it is set, because somebody who has deliberately
-- written data-accent into their page should not be quietly overruled.
alter table studios
  add column if not exists widget_accent    text,
  add column if not exists widget_position  text not null default 'right'
    check (widget_position in ('right', 'left')),
  add column if not exists widget_teaser    text;

comment on column studios.widget_accent is
  'Hex without the hash, e.g. 14243F. Null means our own navy.';
comment on column studios.widget_teaser is
  'The nudge shown a few seconds after landing. Null means the default line.';
