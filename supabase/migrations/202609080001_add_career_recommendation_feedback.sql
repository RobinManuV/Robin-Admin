begin;

create table if not exists public.career_recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  program_code text not null,
  decision text not null check (decision in ('approved', 'rejected')),
  decided_by uuid references public.users(id) on delete set null,
  decided_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, program_code)
);

create index if not exists career_recommendation_feedback_user_id_idx
  on public.career_recommendation_feedback(user_id);

alter table public.career_recommendation_feedback enable row level security;

commit;
