-- Private Storage bucket for reservation confirmation screenshots/files.
-- Unlike app_state (public read), these can contain more sensitive detail,
-- so only signed-in editors can read or write them — no anon access.
-- Viewing a file client-side requires a short-lived signed URL.

insert into storage.buckets (id, name, public)
values ('reservation-files', 'reservation-files', false)
on conflict (id) do nothing;

drop policy if exists "reservation_files_authenticated_all" on storage.objects;
create policy "reservation_files_authenticated_all"
  on storage.objects
  for all
  using (bucket_id = 'reservation-files' and auth.role() = 'authenticated')
  with check (bucket_id = 'reservation-files' and auth.role() = 'authenticated');
