-- Type, weight and surface, so the launcher can pass for part of the site.
--
-- Colour and shape got it most of the way. What still gives it away is the
-- lettering: every site has a typeface it has chosen and paid attention to,
-- and a button in the corner set in the system font reads as somebody else's
-- software sitting on the page — which is exactly what a business is paying
-- us not to look like.
--
-- 'site' is the interesting one. The launcher lives in the business's own
-- document, so inheriting simply picks up whatever that page is set in,
-- whether that is a webfont we have never heard of or their own stack.
alter table studios
  add column if not exists widget_font text not null default 'system'
    check (widget_font in ('system', 'site', 'sans', 'serif', 'rounded', 'mono')),

  add column if not exists widget_weight text not null default 'medium'
    check (widget_weight in ('regular', 'medium', 'bold')),

  -- How the button sits on the page: lifted off it, flat against it, frosted
  -- over it, or drawn as an outline with the page showing through.
  add column if not exists widget_surface text not null default 'raised'
    check (widget_surface in ('raised', 'flat', 'glass', 'outline')),

  -- The nudge, in their own two colours rather than our light or dark. Null
  -- means fall back to whichever of those they picked.
  add column if not exists widget_bubble_fill text,
  add column if not exists widget_bubble_text text;

comment on column studios.widget_font is
  'system, site (inherit the host page), sans, serif, rounded or mono.';
comment on column studios.widget_surface is
  'raised, flat, glass or outline — how the button sits on the page.';
