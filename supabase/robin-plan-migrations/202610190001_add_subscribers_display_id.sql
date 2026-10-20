-- Robin Plan subscribers live in ROBIN_PLAN_SUPABASE_URL, a separate project.
-- Preserve UUID IDs and all references; expose a short label for people.
create sequence if not exists public.robin_subscribers_display_id_seq;

alter table public.subscribers
  add column if not exists display_id text;

update public.subscribers
set display_id = 'ID-' || nextval('public.robin_subscribers_display_id_seq')::text
where display_id is null;

alter table public.subscribers
  alter column display_id set default ('ID-' || nextval('public.robin_subscribers_display_id_seq')::text),
  alter column display_id set not null;

create unique index if not exists subscribers_display_id_key
  on public.subscribers (display_id);

comment on column public.subscribers.display_id is
  'Short human-readable subscriber ID. Internal UUID id remains the primary key.';
