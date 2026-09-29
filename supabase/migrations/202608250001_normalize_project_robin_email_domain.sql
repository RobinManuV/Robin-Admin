begin;

-- The retired domain cannot receive mail. Normalize every operational email
-- reference to the active Google Workspace domain without touching user IDs,
-- passwords, personal student addresses or unrelated fields.
do $$
begin
  if exists (
    select 1
    from public.users retired
    join public.users canonical
      on lower(canonical.email) = regexp_replace(lower(retired.email), '@projectrobin\.com$', '@project-robin.com')
     and canonical.id <> retired.id
    where retired.email ~* '@projectrobin\.com$'
  ) then
    raise exception 'canonical advisor email already belongs to another user';
  end if;
end
$$;

update public.users
set email = regexp_replace(email, '@projectrobin\.com$', '@project-robin.com', 'i'),
    updated_at = now()
where email ~* '@projectrobin\.com$';

update public.users
set assigned_to = regexp_replace(assigned_to, '@projectrobin\.com$', '@project-robin.com', 'i'),
    updated_at = now()
where assigned_to ~* '@projectrobin\.com$';

update public.bookings
set admin_email = regexp_replace(admin_email, '@projectrobin\.com$', '@project-robin.com', 'i')
where admin_email ~* '@projectrobin\.com$';

update public.admin_tasks
set admin_email = regexp_replace(admin_email, '@projectrobin\.com$', '@project-robin.com', 'i')
where admin_email ~* '@projectrobin\.com$';

update public.admin_activity_log
set admin_email = regexp_replace(admin_email, '@projectrobin\.com$', '@project-robin.com', 'i')
where admin_email ~* '@projectrobin\.com$';

update public.career_templates
set created_by = regexp_replace(created_by, '@projectrobin\.com$', '@project-robin.com', 'i')
where created_by ~* '@projectrobin\.com$';

update public.client_careers
set assigned_by = regexp_replace(assigned_by, '@projectrobin\.com$', '@project-robin.com', 'i')
where assigned_by ~* '@projectrobin\.com$';

update public.documents
set uploaded_by = regexp_replace(uploaded_by, '@projectrobin\.com$', '@project-robin.com', 'i')
where uploaded_by ~* '@projectrobin\.com$';

update public.documents
set validated_by = regexp_replace(validated_by, '@projectrobin\.com$', '@project-robin.com', 'i')
where validated_by ~* '@projectrobin\.com$';

update public.notifications
set created_by = regexp_replace(created_by, '@projectrobin\.com$', '@project-robin.com', 'i')
where created_by ~* '@projectrobin\.com$';

commit;
