-- CRM drafts and reusable email templates. Access only through authenticated
-- Netlify Functions using ADMIN_SUPABASE_SERVICE_ROLE_KEY.
create table if not exists public.crm_email_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique,
  subject text not null default '',
  body text not null default '',
  recipient_ids uuid[] not null default '{}',
  campaign_filter text not null default 'all',
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_email_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  subject text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_email_templates_owner_updated_idx
  on public.crm_email_templates (owner_id, updated_at desc);

alter table public.crm_email_drafts enable row level security;
alter table public.crm_email_templates enable row level security;

comment on table public.crm_email_drafts is
  'Private CRM email drafts, accessible through authenticated admin Netlify Functions only.';
comment on table public.crm_email_templates is
  'Private CRM reusable email templates, accessible through authenticated admin Netlify Functions only.';
