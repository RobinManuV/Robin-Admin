-- Historial comercial y sesiones del equipo.
-- Aplicar en el Supabase administrativo (ADMIN_SUPABASE_URL), no en el Portal.

create extension if not exists pgcrypto;

create table if not exists public.crm_users (
  id uuid primary key,
  name text not null,
  email text,
  role text not null default 'agent' check (role in ('agent', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_leads
  add column if not exists owner_id uuid references public.crm_users(id),
  add column if not exists updated_by_user_id uuid references public.crm_users(id),
  add column if not exists is_test boolean not null default false,
  add column if not exists price_at_signature numeric(12,2),
  add column if not exists stage_entered_at timestamptz;

-- La migración antigua creó lost_at como date. A partir de ahora necesitamos
-- la hora exacta para los eventos y las métricas de velocidad.
alter table public.crm_leads
  alter column lost_at type timestamptz
  using case when lost_at is null then null else lost_at::timestamp at time zone 'Europe/Madrid' end;

create table if not exists public.crm_lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  user_id uuid references public.crm_users(id),
  actor_id uuid references public.crm_users(id),
  event_type text not null,
  from_value text,
  to_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_lead_events_lead_created_idx
  on public.crm_lead_events (lead_id, created_at);
create index if not exists crm_lead_events_user_created_idx
  on public.crm_lead_events (user_id, created_at);
create index if not exists crm_lead_events_type_created_idx
  on public.crm_lead_events (event_type, created_at);

create table if not exists public.crm_user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.crm_users(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (last_seen_at >= started_at)
);

create index if not exists crm_user_sessions_user_seen_idx
  on public.crm_user_sessions (user_id, last_seen_at desc);

create or replace function public.crm_prepare_lead_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.crm_stage is distinct from old.crm_stage then
    new.stage_entered_at := now();
    if new.crm_stage = 'Cliente' and new.inside_at is null then
      new.inside_at := now();
    elsif new.crm_stage = 'Lost' and new.lost_at is null then
      new.lost_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_leads_prepare_performance_change on public.crm_leads;
create trigger crm_leads_prepare_performance_change
before update on public.crm_leads
for each row execute function public.crm_prepare_lead_change();

create or replace function public.crm_record_lead_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  credited_user uuid;
  owner_name text;
begin
  credited_user := coalesce(new.owner_id, new.updated_by_user_id);
  owner_name := nullif(new.owner_names[1], '');

  if tg_op = 'INSERT' then
    insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, to_value, metadata, created_at)
    values (
      new.id, credited_user, new.updated_by_user_id, 'created', new.crm_stage,
      jsonb_build_object('owner_name', owner_name), now()
    );
    if new.owner_id is not null or owner_name is not null then
      insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, to_value, metadata, created_at)
      values (
        new.id, credited_user, new.updated_by_user_id, 'assigned', owner_name,
        jsonb_build_object('owner_name', owner_name), now()
      );
    end if;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id or new.owner_names is distinct from old.owner_names then
    insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, from_value, to_value, metadata)
    values (
      new.id, coalesce(new.owner_id, new.updated_by_user_id), new.updated_by_user_id,
      case when old.owner_id is null and coalesce(array_length(old.owner_names, 1), 0) = 0 then 'assigned' else 'owner_changed' end,
      nullif(old.owner_names[1], ''), owner_name,
      jsonb_build_object('owner_name', owner_name)
    );
  end if;

  if new.crm_stage is distinct from old.crm_stage then
    insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, from_value, to_value, metadata)
    values (new.id, credited_user, new.updated_by_user_id, 'stage_changed', old.crm_stage, new.crm_stage, jsonb_build_object('owner_name', owner_name));

    if new.crm_stage = 'Cliente' then
      insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, from_value, to_value, metadata)
      values (new.id, credited_user, new.updated_by_user_id, 'won', old.crm_stage, new.crm_stage, jsonb_build_object('owner_name', owner_name, 'price_at_signature', new.price_at_signature));
    elsif new.crm_stage = 'Lost' then
      insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, from_value, to_value, metadata)
      values (
        new.id, credited_user, new.updated_by_user_id, 'lost', old.crm_stage, new.crm_stage,
        jsonb_build_object(
          'owner_name', owner_name,
          'reason', new.source_payload ->> 'lost_reason',
          'reason_detail', new.source_payload ->> 'lost_reason_detail'
        )
      );
    end if;
  end if;

  if new.lead_type is distinct from old.lead_type then
    insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, from_value, to_value, metadata)
    values (new.id, credited_user, new.updated_by_user_id, 'category_changed', old.lead_type::text, new.lead_type::text, jsonb_build_object('owner_name', owner_name));
  end if;

  if new.heat is distinct from old.heat then
    insert into public.crm_lead_events (lead_id, user_id, actor_id, event_type, from_value, to_value, metadata)
    values (new.id, credited_user, new.updated_by_user_id, 'heat_changed', old.heat::text, new.heat::text, jsonb_build_object('owner_name', owner_name));
  end if;

  return new;
end;
$$;

drop trigger if exists crm_leads_record_performance_insert on public.crm_leads;
create trigger crm_leads_record_performance_insert
after insert on public.crm_leads
for each row execute function public.crm_record_lead_events();

drop trigger if exists crm_leads_record_performance_update on public.crm_leads;
create trigger crm_leads_record_performance_update
after update on public.crm_leads
for each row execute function public.crm_record_lead_events();

alter table public.crm_users enable row level security;
alter table public.crm_lead_events enable row level security;
alter table public.crm_user_sessions enable row level security;

comment on table public.crm_lead_events is
  'Append-only CRM audit history. user_id receives performance credit; actor_id records who executed the change.';
comment on table public.crm_user_sessions is
  'Active CRM sessions updated every 180 seconds only while the app is visible and recently used.';
