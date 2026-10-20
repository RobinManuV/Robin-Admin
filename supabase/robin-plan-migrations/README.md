# Robin Plan Supabase migrations

Apply these SQL files to the separate Supabase project configured through
`ROBIN_PLAN_SUPABASE_URL`. The main `supabase/migrations` and
`supabase/admin-migrations` directories target different projects.

`202610190001_add_subscribers_display_id.sql` adds a short, human-readable ID
to subscriber records while preserving UUID primary keys used by relations.
