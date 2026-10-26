-- Appointments that were filed as time held out of the diary.
--
-- One statement. Safe to run twice.
--
-- The diary decided this column from `blocks`, which means "takes time up".
-- An appointment takes time up, so every appointment anybody typed into a
-- diary was recorded as `block`, which is the value that means NOT WORK.
--
-- Counted on 26 October: 321 appointments worth £7,140.50. Everything
-- downstream filters blocks out and is right to, because a block is a lunch
-- break. So the assistant could not see them, the week's money ignored them,
-- and no review was ever asked for one. Alison texted Amber's about Alfie's
-- midday walk and was told there was nothing in the diary; Amber's whole
-- diary was blocks.
--
-- Only the three categories that are somebody's time with somebody. A break,
-- a holiday, an hour of admin and a trip for supplies stay exactly as they
-- are, which is what this column is for.

update bookings
   set source = 'manual'
 where source = 'block'
   and category in ('appointment', 'consultation', 'meeting');
