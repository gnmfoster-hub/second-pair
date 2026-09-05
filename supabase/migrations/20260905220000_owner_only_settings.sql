-- The rest of the business belongs to whoever owns it.
--
-- The same fault as the artists table, everywhere else it applies. Signed in
-- as an ordinary member of staff, and speaking to the database directly rather
-- than through the application, it was possible to rename the business, change
-- every price, rewrite the FAQs the assistant answers from, change the
-- assistant's tone of voice, change who the widget will book — and stop the
-- business altogether, which silences the assistant for everybody.
--
-- The application refuses all of that already. It is not the place the rule
-- can live: the anon key is public by design and every signed-in browser holds
-- a session token, so anybody who can open a developer console never touches
-- our code.
--
-- Reading stays open to the whole business throughout. Staff need the prices
-- to answer a customer, the FAQs to know what the assistant will say, and the
-- business's own settings to see how it is set up. What they cannot do is
-- change them.
--
-- Deliberately untouched: contacts, conversations, messages, enquiries,
-- bookings, reminders. That is the work. Anybody in the business answers
-- customers and manages the diary, which is the whole point of having staff.

drop policy if exists price_bands_rw on price_bands;

create policy price_bands_read on price_bands for select
  using (is_studio_member(studio_id));

create policy price_bands_owner on price_bands for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));

drop policy if exists faqs_rw on faqs;

create policy faqs_read on faqs for select
  using (is_studio_member(studio_id));

create policy faqs_owner on faqs for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));

/*
 * The business itself.
 *
 * Its name, its opening hours, its trade, how the assistant sounds, what the
 * widget looks like, who it books, how long enquiries are kept, and whether it
 * is running at all. None of that is a member of staff's to change.
 */
drop policy if exists studio_rw on studios;

create policy studios_read on studios for select
  using (is_studio_member(id));

create policy studios_owner on studios for update
  using (is_studio_owner(id))
  with check (is_studio_owner(id));

-- What the trade implies, and what customers are told afterwards. Both are the
-- business speaking, so both are the owner's.
drop policy if exists service_options_rw on service_options;

create policy service_options_read on service_options for select
  using (is_studio_member(studio_id));

create policy service_options_owner on service_options for all
  using (is_studio_owner(studio_id))
  with check (is_studio_owner(studio_id));
