-- Archivo separado para leads que deben retomarse en cursos futuros.
-- Ejecutar en el Supabase administrativo (ADMIN_SUPABASE_URL), no en el Portal.

create extension if not exists pgcrypto;

create table if not exists public.crm_future_leads (
  id uuid primary key default gen_random_uuid(),
  original_lead_id uuid not null unique,
  academic_year text not null check (academic_year in ('2027-28', '2028-29')),
  name text not null,
  email text,
  phone text,
  owner_name text,
  lead_type text,
  heat numeric(5,2),
  contact_role text,
  source text,
  external_id text,
  campaign_name text,
  course text,
  source_created_at timestamptz,
  lead_snapshot jsonb not null,
  call_history jsonb not null default '[]'::jsonb,
  event_history jsonb not null default '[]'::jsonb,
  moved_by_user_id uuid references public.crm_users(id) on delete set null,
  moved_by_name text not null,
  moved_at timestamptz not null default now()
);

alter table public.crm_future_leads
  add column if not exists external_id text,
  add column if not exists course text;

create index if not exists crm_future_leads_academic_year_idx
  on public.crm_future_leads (academic_year, moved_at desc);
create index if not exists crm_future_leads_owner_idx
  on public.crm_future_leads (owner_name, academic_year);
create index if not exists crm_future_leads_email_idx
  on public.crm_future_leads (lower(email));
create unique index if not exists crm_future_leads_source_external_idx
  on public.crm_future_leads (source, external_id)
  where external_id is not null;

alter table public.crm_future_leads enable row level security;

create or replace function public.move_crm_lead_to_future(
  p_lead_id uuid,
  p_academic_year text,
  p_actor_id uuid,
  p_actor_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_lead public.crm_leads%rowtype;
  future_id uuid;
  calls jsonb;
  events jsonb;
begin
  if p_academic_year not in ('2027-28', '2028-29') then
    raise exception using errcode = '22023', message = 'invalid_academic_year';
  end if;

  select * into source_lead
  from public.crm_leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'lead_not_found';
  end if;

  select coalesce(jsonb_agg(to_jsonb(call_row) order by call_row.occurred_at), '[]'::jsonb)
  into calls
  from public.crm_lead_calls call_row
  where call_row.lead_id = p_lead_id;

  select coalesce(jsonb_agg(to_jsonb(event_row) order by event_row.created_at), '[]'::jsonb)
  into events
  from public.crm_lead_events event_row
  where event_row.lead_id = p_lead_id;

  insert into public.crm_future_leads (
    original_lead_id, academic_year, name, email, phone, owner_name,
    lead_type, heat, contact_role, source, external_id, campaign_name, course, source_created_at,
    lead_snapshot, call_history, event_history, moved_by_user_id, moved_by_name
  ) values (
    source_lead.id,
    p_academic_year,
    source_lead.name,
    source_lead.email,
    source_lead.phone,
    nullif(source_lead.owner_names[1], ''),
    source_lead.lead_type::text,
    source_lead.heat,
    source_lead.contact_role,
    nullif(source_lead.source_payload ->> 'source', ''),
    nullif(source_lead.source_payload ->> 'external_id', ''),
    coalesce(nullif(source_lead.source_payload ->> 'campaign_name', ''), nullif(source_lead.campaign_notion_urls[1], '')),
    nullif(source_lead.source_payload ->> 'course', ''),
    source_lead.source_created_at,
    to_jsonb(source_lead),
    calls,
    events,
    p_actor_id,
    coalesce(nullif(trim(p_actor_name), ''), 'Administrador')
  )
  returning id into future_id;

  delete from public.crm_leads where id = p_lead_id;
  return future_id;
end;
$$;

revoke all on function public.move_crm_lead_to_future(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.move_crm_lead_to_future(uuid, text, uuid, text) to service_role;

comment on table public.crm_future_leads is
  'Leads retirados del CRM activo para retomarlos en un curso académico futuro.';
comment on column public.crm_future_leads.academic_year is
  'Categoría del próximo curso: 2027-28 o 2028-29.';
