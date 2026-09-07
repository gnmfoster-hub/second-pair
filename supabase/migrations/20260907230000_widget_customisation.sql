-- Making the launcher fit somebody else's website.
--
-- It sits on a page we did not design, next to a brand we did not choose, and
-- until now the only thing a business could change was its colour. A site with
-- square corners and a dark palette got a round pale bubble that looked like
-- something bolted on, because it was.
--
-- Also an off switch. There is no good reason to make a business argue with
-- its own website: somebody redesigning, somebody trialling, somebody who
-- wants it off for a fortnight in August. Removing the script tag means going
-- back to their developer, which for most of them means not doing it.
alter table studios
  -- Off means the script mounts nothing at all. Not a hidden button: nothing.
  add column if not exists widget_enabled boolean not null default true,

  -- What the launcher says. Null means the line worked out from their hours,
  -- which is right for almost everybody and is not a slogan.
  add column if not exists widget_line_open   text,
  add column if not exists widget_line_closed text,

  -- Round is a chat bubble. Square belongs on a site whose own buttons are
  -- square, and looks wrong anywhere else — which is the point of the choice.
  add column if not exists widget_shape text not null default 'round'
    check (widget_shape in ('round', 'soft', 'square')),

  add column if not exists widget_size text not null default 'medium'
    check (widget_size in ('small', 'medium', 'large')),

  -- The nudge bubble, which was always white with dark writing. On a dark site
  -- that is a torch shone at somebody.
  add column if not exists widget_bubble text not null default 'light'
    check (widget_bubble in ('light', 'dark'));

comment on column studios.widget_enabled is
  'False stops the script mounting anything, without touching their website.';
comment on column studios.widget_line_open is
  'Overrides "Answering now". Null means work it out from their hours.';
comment on column studios.widget_line_closed is
  'Overrides the closed invitation. Null means work it out from their hours.';
