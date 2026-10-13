-- Contacto principal e historial de llamadas de los leads.
-- Ejecutar en el Supabase administrativo (ADMIN_SUPABASE_URL), no en el Portal.

create extension if not exists pgcrypto;

alter table public.crm_leads
  add column if not exists contact_role text;

alter table public.crm_leads
  drop constraint if exists crm_leads_contact_role_check;

alter table public.crm_leads
  add constraint crm_leads_contact_role_check
  check (contact_role is null or contact_role in ('madre', 'padre', 'hijo', 'hija'));

create table if not exists public.crm_lead_calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  actor_id uuid references public.crm_users(id),
  author_name text not null,
  duration_minutes integer not null check (duration_minutes between 1 and 1440),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists crm_lead_calls_lead_occurred_idx
  on public.crm_lead_calls (lead_id, occurred_at desc);

create index if not exists crm_lead_calls_actor_occurred_idx
  on public.crm_lead_calls (actor_id, occurred_at desc);

alter table public.crm_lead_calls enable row level security;

comment on column public.crm_leads.contact_role is
  'Contacto principal del lead: madre, padre, hijo o hija.';

comment on table public.crm_lead_calls is
  'Historial append-only de llamadas comerciales, con duración, notas, fecha y usuario.';
