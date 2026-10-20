-- SQL change for 202610200001 admin profile visibility; apply it only to the Supabase project that owns this migration.
alter table public.users
  add column if not exists visible_tabs text[] not null default array[
    'home.summary', 'home.leads', 'home.students', 'home.analytics', 'home.settings',
    'crm.to_contact', 'crm.contacted', 'crm.clients', 'crm.lost',
    'platform.student_portal', 'platform.robin_plan',
    'analytics.sales', 'analytics.campaigns', 'analytics.web', 'analytics.operations'
  ]::text[];

-- These four accounts are protected profiles. Their admin privileges remain
-- determined by the allowlist in lib/admin-profiles.js.
update public.users
set visible_tabs = array[
  'home.summary', 'home.leads', 'home.students', 'home.analytics', 'home.settings',
  'crm.to_contact', 'crm.contacted', 'crm.clients', 'crm.lost',
  'platform.student_portal', 'platform.robin_plan',
  'analytics.sales', 'analytics.campaigns', 'analytics.web', 'analytics.operations'
]::text[]
where lower(trim(email)) in (
  'noel@project-robin.com',
  'maria@project-robin.com',
  'manuel@project-robin.com',
  'santiago.martin.ab@gmail.com'
);
