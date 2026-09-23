-- A picture of the place.
--
-- Not run yet. Everything shipped alongside it reads an absent column as "no
-- picture", which is exactly how every business looks today.
--
-- People already have one: artists.avatar_path, in the public `avatars`
-- bucket, falling back to initials on a colour derived from the name. The
-- business itself had nothing, so anything addressed to a customer — the
-- widget, and now the booking page — could show who they were seeing and not
-- where they were going.
--
-- Giles, looking at how Fresha does it: the picture of the business is a good
-- one, they can upload a picture at set-up to build trust, or a logo if a
-- picture is not available.
--
-- One column rather than two. "Photo or logo" is a choice about what to put in
-- it, not two different things to store and decide between at every use — and
-- a business with both would have to be asked which one wins, which is a
-- question nobody wants asked. The screen says what makes a good one.
--
-- The same bucket as the faces, and public for the same reason: these appear
-- in the widget on the business's own website and on a booking page somebody
-- opens from a text, where there is no session to check. Filed under the
-- studio's own folder, so the existing tenancy policy covers it unchanged.

alter table studios
  add column if not exists photo_path text;

comment on column studios.photo_path is
  'Path in the public `avatars` bucket: a photo of the place, or a logo. Null means none.';
