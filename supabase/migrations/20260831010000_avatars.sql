-- Faces.
--
-- A diary with four people in it is read by colour and face long before it is
-- read by name, and a client picking who tattoos them wants to see whose work
-- it is. The assistant is told who is who so it can name them naturally.

alter table artists
  add column avatar_path text,
  -- Falls back to initials on a colour derived from the name, so a person
  -- without a photo still reads as themselves rather than as a grey blank.
  add column colour text;

comment on column artists.avatar_path is
  'Path in the public `avatars` bucket. Null means initials are shown instead.';

-- Public, unlike the reference-image bucket: these appear in the widget on the
-- studio's own website, where the viewer has no session.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Filed under <studio_id>/, so the tenancy check is the same as everywhere else.
create policy "studio members manage avatars" on storage.objects
  for all
  using (
    bucket_id = 'avatars'
    and is_studio_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'avatars'
    and is_studio_member(((storage.foldername(name))[1])::uuid)
  );
