-- SQL change for 202608260001 add user avatar path; apply it only to the Supabase project that owns this migration.
alter table public.users
  add column if not exists avatar_path text;

comment on column public.users.avatar_path is
  'Private Supabase Storage path in the documents bucket for the user profile avatar.';
