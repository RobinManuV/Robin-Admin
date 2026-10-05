-- Datos simulados de Ventas. Aplicar en ADMIN_SUPABASE_URL.
-- No contiene datos reales de Meta: permite probar el dashboard sin depender de la API.
create table if not exists public.sales_simulated_meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  test_run text not null,
  campaign_id text not null,
  campaign_name text not null,
  period_start date not null,
  period_end date not null,
  spend numeric(12,2) not null default 0,
  leads integer not null default 0,
  created_at timestamptz not null default now(),
  unique (test_run, campaign_id, period_start, period_end)
);

create index if not exists sales_simulated_meta_campaigns_period_idx
  on public.sales_simulated_meta_campaigns (period_start, period_end);

comment on table public.sales_simulated_meta_campaigns is
  'Fixtures de Meta Ads para pruebas; nunca deben mezclarse con datos reales.';

create table if not exists public.sales_test_runs (
  id uuid primary key default gen_random_uuid(),
  test_run text not null unique,
  status text not null default 'active' check (status in ('active', 'stopping', 'stopped')),
  launched_by uuid,
  launched_at timestamptz not null default now(),
  stopped_at timestamptz
);

create unique index if not exists sales_test_runs_one_active_idx
  on public.sales_test_runs ((status)) where status = 'active';
