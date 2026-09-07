-- The colour of the writing on the button, as against the button.
--
-- White was assumed, and a business whose brand colour is pale got white on
-- pale. That is now darkened automatically so white always reads — but
-- "automatically readable" and "the colour I actually want" are different
-- things, and a business with a cream or charcoal brand should be able to say
-- so rather than be given a white that is merely legal.
--
-- Null means work it out: white, or near-black when the button is pale enough
-- that white would be the wrong answer. That is the right default and most
-- businesses will never touch it.
alter table studios
  add column if not exists widget_text text;

comment on column studios.widget_text is
  'Six hex digits, no hash, for the writing on the widget button. Null means choose automatically from the accent.';
