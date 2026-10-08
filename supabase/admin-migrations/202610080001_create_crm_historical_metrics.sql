-- Cohortes históricas para métricas del CRM.
-- Aplicar en ADMIN_SUPABASE_URL. Estas tablas no alimentan la bandeja ni el Portal.

create extension if not exists pgcrypto;

create table if not exists public.crm_metric_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_sha256 text not null unique,
  methodology_version text not null,
  cutoff_at timestamptz not null,
  status text not null default 'staged'
    check (status in ('staged', 'active', 'superseded', 'failed')),
  expected_rows integer not null check (expected_rows >= 0),
  imported_rows integer not null default 0 check (imported_rows >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create unique index if not exists crm_metric_import_batches_one_active_source_idx
  on public.crm_metric_import_batches (source)
  where status = 'active';

create table if not exists public.crm_historical_campaign_map (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.crm_metric_import_batches(id) on delete cascade,
  campaign_name text not null,
  campaign_key text not null,
  channel text not null check (channel in ('meta', 'organic', 'schools', 'other')),
  meta_campaign_id text,
  meta_campaign_name text,
  match_method text check (match_method is null or match_method in ('exact_name', 'manual_id', 'unmatched', 'not_applicable')),
  created_at timestamptz not null default now(),
  unique (import_batch_id, campaign_key)
);

create index if not exists crm_historical_campaign_map_meta_idx
  on public.crm_historical_campaign_map (meta_campaign_id)
  where meta_campaign_id is not null;

create table if not exists public.crm_historical_lead_facts (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.crm_metric_import_batches(id) on delete cascade,
  legacy_lead_key text not null,
  acquired_at timestamptz not null,
  cohort_month date not null,
  campaign_name text not null,
  campaign_key text not null,
  channel text not null check (channel in ('meta', 'organic', 'schools', 'other')),
  manager text not null check (manager in ('Noel', 'María', 'Manuel', 'Varios', 'Sin gestor')),
  is_client boolean not null default false,
  client_at timestamptz,
  client_date_source text not null default 'unknown'
    check (client_date_source in ('portal_contract', 'unknown')),
  portal_user_id uuid,
  created_at timestamptz not null default now(),
  unique (import_batch_id, legacy_lead_key),
  foreign key (import_batch_id, campaign_key)
    references public.crm_historical_campaign_map(import_batch_id, campaign_key)
);

create index if not exists crm_historical_lead_facts_acquired_idx
  on public.crm_historical_lead_facts (acquired_at);
create index if not exists crm_historical_lead_facts_campaign_idx
  on public.crm_historical_lead_facts (campaign_key, acquired_at);
create index if not exists crm_historical_lead_facts_manager_idx
  on public.crm_historical_lead_facts (manager, acquired_at);
create index if not exists crm_historical_lead_facts_client_idx
  on public.crm_historical_lead_facts (is_client, acquired_at);
create index if not exists crm_historical_lead_facts_portal_user_idx
  on public.crm_historical_lead_facts (portal_user_id)
  where portal_user_id is not null;

create or replace view public.crm_active_historical_lead_facts
with (security_invoker = true)
as
select
  facts.*,
  campaigns.meta_campaign_id,
  campaigns.meta_campaign_name,
  campaigns.match_method as campaign_match_method,
  batches.cutoff_at,
  batches.methodology_version
from public.crm_historical_lead_facts facts
join public.crm_metric_import_batches batches
  on batches.id = facts.import_batch_id and batches.status = 'active'
join public.crm_historical_campaign_map campaigns
  on campaigns.import_batch_id = facts.import_batch_id
 and campaigns.campaign_key = facts.campaign_key;

create or replace function public.crm_activate_historical_metric_batch(p_batch_id uuid)
returns public.crm_metric_import_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.crm_metric_import_batches;
  actual_rows integer;
begin
  select * into target
  from public.crm_metric_import_batches
  where id = p_batch_id
  for update;

  if target.id is null then
    raise exception 'historical_metric_batch_not_found';
  end if;
  if target.status not in ('staged', 'superseded') then
    raise exception 'historical_metric_batch_not_activatable';
  end if;

  select count(*) into actual_rows
  from public.crm_historical_lead_facts
  where import_batch_id = p_batch_id;

  if actual_rows <> target.expected_rows then
    raise exception 'historical_metric_row_count_mismatch: expected %, got %', target.expected_rows, actual_rows;
  end if;

  update public.crm_metric_import_batches
  set status = 'superseded'
  where source = target.source and status = 'active';

  update public.crm_metric_import_batches
  set status = 'active', imported_rows = actual_rows, activated_at = now()
  where id = p_batch_id
  returning * into target;

  return target;
end;
$$;

alter table public.crm_metric_import_batches enable row level security;
alter table public.crm_historical_campaign_map enable row level security;
alter table public.crm_historical_lead_facts enable row level security;

revoke all on public.crm_metric_import_batches from anon, authenticated;
revoke all on public.crm_historical_campaign_map from anon, authenticated;
revoke all on public.crm_historical_lead_facts from anon, authenticated;
revoke all on public.crm_active_historical_lead_facts from anon, authenticated;
revoke all on function public.crm_activate_historical_metric_batch(uuid) from public, anon, authenticated;
grant select, insert, update, delete on public.crm_metric_import_batches to service_role;
grant select, insert, update, delete on public.crm_historical_campaign_map to service_role;
grant select, insert, update, delete on public.crm_historical_lead_facts to service_role;
grant select on public.crm_active_historical_lead_facts to service_role;
grant execute on function public.crm_activate_historical_metric_batch(uuid) to service_role;

comment on table public.crm_historical_lead_facts is
  'Immutable, pseudonymous acquisition cohorts used only by analytics. Never returned by the CRM leads endpoint.';
comment on table public.crm_historical_campaign_map is
  'Maps the original historical campaign classification to Meta campaign ids or non-Meta channels.';
comment on view public.crm_active_historical_lead_facts is
  'Only the active validated historical import, enriched with its campaign mapping.';
