begin;

-- The production table is empty at migration time. Replace the retired Zoom
-- persistence contract with the only meeting provider supported by the portal.
alter table public.bookings
  alter column user_id set not null,
  alter column admin_email set not null,
  add column meet_join_url text not null,
  add column meet_code text,
  add column calendar_event_id text not null;

alter table public.bookings
  add constraint bookings_meet_join_url_check
    check (meet_join_url ~ '^https://meet\.google\.com/[a-z-]+([/?#].*)?$');

create unique index bookings_advisor_scheduled_slot_key
  on public.bookings (admin_email, start_at)
  where status = 'scheduled';

create unique index bookings_calendar_event_key
  on public.bookings (admin_email, calendar_event_id);

alter table public.bookings
  drop column zoom_meeting_id,
  drop column zoom_join_url,
  drop column zoom_start_url,
  drop column zoom_password;

commit;
