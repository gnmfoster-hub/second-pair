-- Whether the button asks to be looked at.
--
-- 'once' is what it does today: two rings when the nudge appears, at the
-- moment there is something to read. 'always' keeps going for somebody who
-- wants it noticed on a busy page — and stops on its own once the visitor has
-- opened it or waved the nudge away, because a button that pulses at somebody
-- for the whole time they are reading stops being a signal and becomes a
-- nuisance they resent.
--
-- 'off' is for a site where a moving thing in the corner would be wrong.
alter table studios
  add column if not exists widget_pulse text not null default 'once'
    check (widget_pulse in ('off', 'once', 'always'));

comment on column studios.widget_pulse is
  'off, once (when the nudge appears) or always (until opened or dismissed).';
