create table if not exists public.finance_treasury_snapshots (
  snapshot_date date primary key,
  total_eur numeric(18, 2) not null,
  accounts jsonb not null default '[]'::jsonb,
  fx_rates jsonb not null default '{}'::jsonb,
  source text not null check (source in ('holded_month_end', 'scheduled', 'manual')),
  captured_at timestamptz not null default now()
);

comment on table public.finance_treasury_snapshots is
  'Histórico del saldo conjunto de todas las cuentas activas de Tesorería de Holded, convertido a EUR con el cambio diario del BCE.';

alter table public.finance_treasury_snapshots enable row level security;

revoke all on table public.finance_treasury_snapshots from anon, authenticated;

create index if not exists finance_treasury_snapshots_captured_at_idx
  on public.finance_treasury_snapshots (captured_at desc);
