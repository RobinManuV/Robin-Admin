-- Human-friendly labels for user records. Keep UUID `id` as the primary key:
-- it is referenced throughout the portal, bookings, payments, and documents.
create sequence if not exists public.robin_users_display_id_seq;

alter table public.users
  add column if not exists display_id text;

update public.users
set display_id = 'ID-' || nextval('public.robin_users_display_id_seq')::text
where display_id is null;

alter table public.users
  alter column display_id set default ('ID-' || nextval('public.robin_users_display_id_seq')::text),
  alter column display_id set not null;

create unique index if not exists users_display_id_key
  on public.users (display_id);

comment on column public.users.display_id is
  'Short human-readable ID for admin and student records. Internal UUID id remains the primary key.';
