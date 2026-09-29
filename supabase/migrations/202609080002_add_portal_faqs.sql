create table if not exists public.portal_faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null check (char_length(trim(question)) between 1 and 300),
  answer text not null check (char_length(trim(answer)) between 1 and 5000),
  category text not null default 'General',
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_portal_faqs_order on public.portal_faqs(published, sort_order, created_at);
alter table public.portal_faqs enable row level security;
notify pgrst, 'reload schema';
