alter table public.users
  add column if not exists telefono_alumno text;

comment on column public.users.telefono_alumno is
  'Número de teléfono del alumno facilitado durante el onboarding.';
