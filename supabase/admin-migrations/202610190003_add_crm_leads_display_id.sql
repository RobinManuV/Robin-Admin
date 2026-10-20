-- The CRM uses a separate Supabase project from the application users table.
-- Preserve UUID IDs and all references; expose a short label for people.
create sequence if not exists public.robin_crm_display_id_seq;

alter table public.crm_leads
  add column if not exists display_id text;

update public.crm_leads
set display_id = 'ID-' || nextval('public.robin_crm_display_id_seq')::text
where display_id is null;

alter table public.crm_leads
  alter column display_id set default ('ID-' || nextval('public.robin_crm_display_id_seq')::text),
  alter column display_id set not null;

create unique index if not exists crm_leads_display_id_key
  on public.crm_leads (display_id);

comment on column public.crm_leads.display_id is
  'Short human-readable lead ID. Internal UUID id remains the primary key.';
