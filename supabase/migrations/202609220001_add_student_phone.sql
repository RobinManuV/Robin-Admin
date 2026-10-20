-- SQL change for 202609220001 add student phone; apply it only to the Supabase project that owns this migration.
alter table public.users
  add column if not exists telefono_alumno text;

comment on column public.users.telefono_alumno is
  'Número de teléfono del alumno facilitado durante el onboarding.';
