alter table public.users
  add column if not exists avatar_path text;

comment on column public.users.avatar_path is
  'Private Supabase Storage path in the documents bucket for the user profile avatar.';
