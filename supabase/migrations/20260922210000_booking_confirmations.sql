-- Booking confirmations, as a reminder that is due the moment it is made.
--
-- Not run yet. Giles runs migrations by hand in the Supabase SQL editor, and
-- nothing in the code depends on this until he says to build the rest.
--
-- Why this shape rather than a new table. A confirmation is the same thing a
-- reminder already is: a template belonging to a business, rendered when it
-- goes out rather than when it is scheduled, delivered on whichever channel
-- the customer came in on, honouring their opt-out, and surfacing in the
-- dashboard for the owner to send by hand if that channel is not connected
-- yet. All of that exists and works. The only thing reminder_templates cannot
-- currently say is "send this one straight away", because hours_before is
-- constrained to be greater than zero.
--
-- So zero means "when they book". scheduleReminders reads a zero and sets
-- due_at to now instead of to the appointment time, and everything downstream
-- is unchanged. The unique (studio_id, hours_before) constraint then gives a
-- business exactly one confirmation, which is the right number.

alter table reminder_templates
  drop constraint if exists reminder_templates_hours_before_check;

alter table reminder_templates
  add constraint reminder_templates_hours_before_check
  check (hours_before >= 0 and hours_before <= 720);

comment on column reminder_templates.hours_before is
  'Hours before the appointment. Zero means send it as soon as the booking is made, which is the confirmation.';
