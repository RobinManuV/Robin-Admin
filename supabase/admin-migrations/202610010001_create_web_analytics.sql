-- ============================================================
-- Analítica propia de la web pública (project-robin.com) para la pestaña "Web".
-- Base: Supabase administrativo (ADMIN_SUPABASE_URL / ADMIN_SUPABASE_SERVICE_ROLE_KEY).
--
-- Los eventos llegan desde la web SOLO de visitantes que aceptan las cookies de
-- analítica (clics, scroll, vídeos, formularios…), más avisos anónimos del servidor
-- de la web cuando se envía un formulario o una reserva (sin nombre, email ni teléfono).
-- Solo las funciones de servidor (clave de servicio) leen y escriben esta tabla.
-- Retención: 14 meses (función web_events_purge, llamada a diario por web-retention).
-- ============================================================

create table if not exists public.web_events (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  event_at timestamptz not null default now(),
  visitor_id text,
  session_id text,
  type text not null,
  path text,
  device text,
  country text,
  server boolean not null default false,
  data jsonb not null default '{}'::jsonb
);

create index if not exists web_events_event_at_idx on public.web_events (event_at);
create index if not exists web_events_type_at_idx on public.web_events (type, event_at);
create index if not exists web_events_path_type_idx on public.web_events (path, type, event_at);
create index if not exists web_events_session_idx on public.web_events (session_id, event_at);
create index if not exists web_events_visitor_idx on public.web_events (visitor_id, event_at);

alter table public.web_events enable row level security;
revoke all on public.web_events from anon, authenticated;

-- ------------------------------------------------------------
-- Resumen completo para el panel (un solo viaje a la base de datos)
-- ------------------------------------------------------------
create or replace function public.web_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
with ev as (
  select * from web_events where event_at >= p_from and event_at < p_to
),
pv as (
  select *, row_number() over (partition by session_id order by event_at, id) as n_asc,
            row_number() over (partition by session_id order by event_at desc, id desc) as n_desc
  from ev where type = 'page_view' and session_id is not null
),
leaves as (
  select path, (data->>'active_ms')::numeric as active_ms, (data->>'depth')::numeric as depth,
         (data->>'lcp')::numeric as lcp, (data->>'cls')::numeric as cls, (data->>'inp')::numeric as inp, device
  from ev where type = 'page_leave'
),
sess as (
  select session_id, count(*) as pages,
         min(event_at) as started,
         (array_agg(path order by event_at, id))[1] as landing,
         (array_agg(path order by event_at desc, id desc))[1] as exit_page
  from pv group by session_id
),
conv as (
  select * from ev where server and type in ('lead', 'booking')
),
kpis as (
  select jsonb_build_object(
    'page_views', (select count(*) from ev where type = 'page_view'),
    'sessions', (select count(*) from sess),
    'visitors', (select count(distinct visitor_id) from ev where type = 'page_view'),
    'avg_active_ms', (select round(avg(active_ms)) from leaves where active_ms is not null),
    'avg_depth', (select round(avg(depth)) from leaves where depth is not null),
    'single_page_sessions', (select count(*) from sess where pages = 1),
    'pages_per_session', (select round(avg(pages)::numeric, 2) from sess),
    'leads', (select count(*) from conv where type = 'lead'),
    'bookings', (select count(*) from conv where type = 'booking'),
    'measured_sessions_with_conversion', (select count(distinct c.visitor_id) from conv c where c.visitor_id is not null)
  ) as v
),
daily as (
  select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) as v from (
    select to_char(date_trunc('day', event_at at time zone 'Europe/Madrid'), 'YYYY-MM-DD') as day,
           count(*) filter (where type = 'page_view') as page_views,
           count(distinct session_id) filter (where type = 'page_view') as sessions,
           count(*) filter (where server and type = 'lead') as leads,
           count(*) filter (where server and type = 'booking') as bookings
    from ev group by 1
  ) d
),
pages as (
  select coalesce(jsonb_agg(p order by p.views desc), '[]'::jsonb) as v from (
    select pv.path,
           count(*) as views,
           count(distinct pv.session_id) as sessions,
           count(*) filter (where pv.n_asc = 1) as entries,
           count(*) filter (where pv.n_desc = 1) as exits,
           round(100.0 * count(*) filter (where pv.n_desc = 1) / nullif(count(*), 0), 1) as exit_rate,
           (select round(avg(l.active_ms)) from leaves l where l.path = pv.path) as avg_active_ms,
           (select round(avg(l.depth)) from leaves l where l.path = pv.path) as avg_depth,
           (select count(*) from conv c where c.path = pv.path) as conversions
    from pv group by pv.path order by views desc limit 60
  ) p
),
sources as (
  select coalesce(jsonb_agg(s order by s.sessions desc), '[]'::jsonb) as v from (
    select coalesce(nullif(data->>'utm_source', ''),
                    nullif(regexp_replace(coalesce(data->>'ref', ''), '^https?://(www\.)?([^/]+).*$', '\2'), ''),
                    '(directo)') as source,
           coalesce(nullif(data->>'utm_medium', ''), case when coalesce(data->>'ref', '') = '' then 'directo' else 'referencia' end) as medium,
           nullif(data->>'utm_campaign', '') as campaign,
           count(*) as sessions
    from pv where n_asc = 1 group by 1, 2, 3 order by sessions desc limit 40
  ) s
),
journeys as (
  select coalesce(jsonb_agg(j order by j.sessions desc), '[]'::jsonb) as v from (
    select route, count(*) as sessions from (
      select session_id, string_agg(path, ' → ' order by event_at, id) as route
      from (select session_id, path, event_at, id from pv where n_asc <= 4) x group by session_id
    ) r group by route order by sessions desc limit 15
  ) j
),
ctas as (
  select coalesce(jsonb_agg(c order by c.clicks desc), '[]'::jsonb) as v from (
    select coalesce(nullif(data->>'label', ''), data->>'href', '(sin texto)') as label,
           path, data->>'href' as href,
           count(*) as clicks, count(distinct session_id) as sessions
    from ev where type = 'click' and (data->>'cta')::boolean is true
    group by 1, 2, 3 order by clicks desc limit 50
  ) c
),
forms as (
  select coalesce(jsonb_agg(f order by f.sent desc), '[]'::jsonb) as v from (
    select coalesce(k.form, s.form) as form, coalesce(k.form_tag, s.form_tag) as form_tag,
           coalesce(s.sent, 0) as sent,
           coalesce(k.started, 0) as started_measured,
           coalesce(k.submitted, 0) as submitted_measured,
           round(100.0 * s.sent / nullif(sum(s.sent) over (), 0), 1) as share_pct
    from (
      select data->>'form' as form, data->>'form_tag' as form_tag, count(*) as sent
      from conv group by 1, 2
    ) s
    full join (
      select data->>'form' as form, data->>'form_tag' as form_tag,
             count(distinct session_id) filter (where type = 'form_start') as started,
             count(distinct session_id) filter (where type = 'form_submit') as submitted
      from ev where type in ('form_start', 'form_submit') group by 1, 2
    ) k on k.form = s.form and coalesce(k.form_tag, '') = coalesce(s.form_tag, '')
  ) f
),
conversion_paths as (
  select coalesce(jsonb_agg(cp order by cp.at desc), '[]'::jsonb) as v from (
    select c.event_at as at, c.type, c.data->>'form' as form, c.data->>'form_tag' as form_tag, c.path as page,
           (select count(distinct e.session_id) from web_events e
              where e.visitor_id = c.visitor_id and e.type = 'page_view'
                and e.event_at <= c.event_at and e.event_at > c.event_at - interval '60 days') as visits,
           (select coalesce(nullif(e.data->>'utm_source', ''), nullif(regexp_replace(coalesce(e.data->>'ref', ''), '^https?://(www\.)?([^/]+).*$', '\2'), ''), '(directo)')
              from web_events e where e.visitor_id = c.visitor_id and e.type = 'page_view'
                and e.event_at <= c.event_at and e.event_at > c.event_at - interval '60 days'
              order by e.event_at asc limit 1) as first_source,
           (select string_agg(path, ' → ' order by first_at) from (
              select e.path, min(e.event_at) as first_at from web_events e
              where e.visitor_id = c.visitor_id and e.type = 'page_view'
                and e.event_at <= c.event_at and e.event_at > c.event_at - interval '60 days'
              group by e.path order by first_at limit 8) pp) as pages
    from conv c where c.visitor_id is not null
    order by c.event_at desc limit 30
  ) cp
),
videos as (
  select coalesce(jsonb_agg(v order by v.plays desc), '[]'::jsonb) as v from (
    select data->>'video' as video,
           max(data->>'title') as title,
           count(*) filter (where type = 'video_play') as plays,
           count(distinct session_id) filter (where type = 'video_play') as viewers,
           count(*) filter (where type = 'video_progress' and (data->>'pct')::int = 25) as p25,
           count(*) filter (where type = 'video_progress' and (data->>'pct')::int = 50) as p50,
           count(*) filter (where type = 'video_progress' and (data->>'pct')::int = 75) as p75,
           count(*) filter (where type = 'video_progress' and (data->>'pct')::int = 100) as p100,
           (array_agg(distinct data->>'where') filter (where type = 'video_play'))[1:5] as places
    from ev where type in ('video_play', 'video_progress') and data ? 'video'
    group by 1 order by plays desc limit 40
  ) v
),
devices as (
  select coalesce(jsonb_object_agg(coalesce(device, 'desconocido'), n), '{}'::jsonb) as v
  from (select device, count(distinct session_id) as n from pv group by device) d
),
countries as (
  select coalesce(jsonb_agg(c order by c.sessions desc), '[]'::jsonb) as v from (
    select coalesce(country, '??') as country, count(distinct session_id) as sessions from pv group by 1 order by 2 desc limit 20
  ) c
),
vitals as (
  select coalesce(jsonb_agg(t order by t.samples desc), '[]'::jsonb) as v from (
    select path, device, count(*) as samples,
           round(percentile_cont(0.75) within group (order by lcp)::numeric) as lcp_p75,
           round(percentile_cont(0.75) within group (order by cls)::numeric, 3) as cls_p75,
           round(percentile_cont(0.75) within group (order by inp)::numeric) as inp_p75
    from leaves where lcp is not null group by path, device having count(*) >= 3 order by samples desc limit 40
  ) t
),
not_found as (
  select coalesce(jsonb_agg(n order by n.hits desc), '[]'::jsonb) as v from (
    select path, count(*) as hits, max(data->>'ref') as example_ref
    from ev where type = 'page_view' and (data->>'is404')::boolean is true group by path order by hits desc limit 30
  ) n
),
js_errors as (
  select coalesce(jsonb_agg(e order by e.hits desc), '[]'::jsonb) as v from (
    select data->>'msg' as message, max(path) as example_path, count(*) as hits
    from ev where type = 'js_error' group by 1 order by hits desc limit 20
  ) e
)
select jsonb_build_object(
  'from', p_from, 'to', p_to,
  'kpis', (select v from kpis),
  'daily', (select v from daily),
  'pages', (select v from pages),
  'sources', (select v from sources),
  'journeys', (select v from journeys),
  'ctas', (select v from ctas),
  'forms', (select v from forms),
  'conversion_paths', (select v from conversion_paths),
  'videos', (select v from videos),
  'devices', (select v from devices),
  'countries', (select v from countries),
  'vitals', (select v from vitals),
  'not_found', (select v from not_found),
  'js_errors', (select v from js_errors)
);
$$;

-- ------------------------------------------------------------
-- Datos del mapa de calor de una página (clics agrupados y scroll)
-- ------------------------------------------------------------
create or replace function public.web_heatmap(p_path text, p_device text, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
with clicks as (
  select data->>'sel' as sel,
         round((data->>'rx')::numeric, 2) as rx, round((data->>'ry')::numeric, 2) as ry,
         (data->>'x')::int as x, (data->>'y')::int as y, (data->>'pw')::int as pw,
         data->>'label' as label
  from web_events
  where type = 'click' and path = p_path and event_at >= p_from and event_at < p_to
    and (p_device is null or p_device = '' or device = p_device)
),
leaves as (
  select least(100, greatest(0, (data->>'depth')::int)) as depth
  from web_events
  where type = 'page_leave' and path = p_path and event_at >= p_from and event_at < p_to
    and (p_device is null or p_device = '' or device = p_device)
)
select jsonb_build_object(
  'path', p_path,
  'device', p_device,
  'total_clicks', (select count(*) from clicks),
  'views', (select count(*) from web_events where type = 'page_view' and path = p_path and event_at >= p_from and event_at < p_to and (p_device is null or p_device = '' or device = p_device)),
  'clicks', coalesce((
    select jsonb_agg(jsonb_build_object('sel', sel, 'rx', rx, 'ry', ry, 'x', x, 'y', y, 'pw', pw, 'n', n))
    from (
      select sel, rx, ry, min(x) as x, min(y) as y, min(pw) as pw, count(*) as n
      from clicks group by sel, rx, ry order by n desc limit 4000
    ) g
  ), '[]'::jsonb),
  'top_elements', coalesce((
    select jsonb_agg(t) from (
      select coalesce(nullif(label, ''), sel) as label, count(*) as clicks from clicks group by 1 order by 2 desc limit 15
    ) t
  ), '[]'::jsonb),
  'scroll', coalesce((
    select jsonb_agg(jsonb_build_object('depth', d, 'pct', round(100.0 * (select count(*) from leaves where depth >= d) / nullif((select count(*) from leaves), 0), 1)) order by d)
    from generate_series(0, 90, 10) d
  ), '[]'::jsonb)
);
$$;

-- Páginas con datos (para el selector del mapa de calor)
create or replace function public.web_heatmap_pages(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
select coalesce(jsonb_agg(p order by p.clicks desc), '[]'::jsonb) from (
  select path, count(*) filter (where type = 'click') as clicks, count(*) filter (where type = 'page_view') as views
  from web_events where event_at >= p_from and event_at < p_to and type in ('click', 'page_view')
  group by path having count(*) filter (where type = 'click') > 0 order by 2 desc limit 100
) p;
$$;

-- Borrado de datos antiguos (14 meses)
create or replace function public.web_events_purge()
returns integer
language sql
set search_path = public
as $$
with d as (delete from web_events where event_at < now() - interval '14 months' returning 1)
select count(*)::int from d;
$$;

revoke all on function public.web_stats(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.web_heatmap(text, text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.web_heatmap_pages(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.web_events_purge() from public, anon, authenticated;
grant execute on function public.web_stats(timestamptz, timestamptz) to service_role;
grant execute on function public.web_heatmap(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.web_heatmap_pages(timestamptz, timestamptz) to service_role;
grant execute on function public.web_events_purge() to service_role;
