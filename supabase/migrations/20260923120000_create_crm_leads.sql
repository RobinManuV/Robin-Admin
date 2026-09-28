-- CRM replacement for the Notion "Main Database".
-- Source data source: collection://1eb06954-2601-807d-a6c1-000b124a0d45

create extension if not exists pgcrypto;

-- Portal Admin contained an empty prototype table with this name. Replace only
-- that CRM prototype; unrelated project tables are intentionally untouched.
drop table if exists public.crm_lead_applications cascade;
drop table if exists public.crm_leads cascade;
drop type if exists public.crm_application_status cascade;
drop type if exists public.crm_task_status cascade;
drop type if exists public.crm_lead_lifecycle cascade;
drop type if exists public.crm_lead_type cascade;
drop type if exists public.crm_lead_area cascade;

create type public.crm_lead_area as enum (
  'Concreto', 'Psycology', 'Engineering', 'Health',
  'International studies', 'Business', 'chemistry'
);

create type public.crm_lead_type as enum (
  'General', 'Delft', 'Llegada', 'Mentoría', 'LATAM', 'ESPECIAL'
);

create type public.crm_lead_lifecycle as enum (
  'LOST 25-26', 'LOST', '26-27', 'INSIDE',
  '28-29', '27-28', 'año que viene', '25-26'
);

create type public.crm_task_status as enum (
  'Sin empezar', 'En progreso', 'Listo'
);

create type public.crm_application_status as enum (
  'studielink', 'elegir', 'got_it', 'rejected', 'portal_abierto',
  'waiting_answer', 'no', 'pack_llegada', 'making_docs', 'uploading_docs'
);

create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  notion_page_url text unique,
  notion_numeric_id bigint unique,

  name text not null,
  email text,
  phone text,
  email_uid text,
  summary text,
  body_text text,
  comment text,
  first_contact_comment text,

  area public.crm_lead_area,
  lead_type public.crm_lead_type,
  lifecycle public.crm_lead_lifecycle,
  task_status public.crm_task_status,
  heat numeric(5,2) check (heat is null or (heat >= 0 and heat <= 100)),

  contact_at timestamptz,
  chase_at timestamptz,
  meeting_at timestamptz,
  overdue_at timestamptz,
  inside_at timestamptz,

  owner_names text[] not null default '{}',
  notion_owner_ids text[] not null default '{}',
  rolled_up_owner text,

  robin boolean not null default false,
  attended_previous_events boolean not null default false,
  first_payment_received boolean not null default false,
  folder_created boolean not null default false,
  checked boolean not null default false,

  school_name text,
  school_notion_urls text[] not null default '{}',
  campaign_notion_urls text[] not null default '{}',
  canva_presentation_url text,

  source_formula jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_lead_applications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  status public.crm_application_status,
  original_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, position)
);

create index crm_leads_lifecycle_idx on public.crm_leads (lifecycle);
create index crm_leads_contact_at_idx on public.crm_leads (contact_at desc);
create index crm_leads_meeting_at_idx on public.crm_leads (meeting_at desc);
create index crm_leads_owner_names_idx on public.crm_leads using gin (owner_names);
create index crm_leads_email_idx on public.crm_leads (lower(email));
create index crm_leads_phone_idx on public.crm_leads (phone);
create index crm_leads_heat_idx on public.crm_leads (heat desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger crm_leads_set_updated_at
before update on public.crm_leads
for each row execute function public.set_updated_at();

create trigger crm_lead_applications_set_updated_at
before update on public.crm_lead_applications
for each row execute function public.set_updated_at();

alter table public.crm_leads enable row level security;
alter table public.crm_lead_applications enable row level security;

comment on table public.crm_leads is
  'Canonical CRM lead database replacing Notion Main Database.';
comment on column public.crm_leads.source_payload is
  'Lossless staging copy of source-only or future Notion properties during migration.';
comment on column public.crm_leads.checked is
  'Normalized value of Notion select property chck (si = true).';
