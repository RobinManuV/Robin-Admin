-- Privileged SQL RPC for the developer-only Netlify database console.
CREATE OR REPLACE FUNCTION public.admin_execute_sql(statement text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  command_text text := btrim(statement);
  result_rows jsonb;
  affected_rows bigint;
BEGIN
  IF command_text IS NULL OR command_text = '' THEN
    RAISE EXCEPTION 'SQL statement is required';
  END IF;
  command_text := regexp_replace(command_text, ';\s*$', '');
  IF position(';' IN command_text) > 0 THEN
    RAISE EXCEPTION 'Execute one SQL statement at a time';
  END IF;
  IF upper(command_text) ~ '^\s*(SELECT|WITH|VALUES|SHOW|EXPLAIN)\b' THEN
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(_rows)), ''[]''::jsonb) FROM (SELECT * FROM (%s) AS _query LIMIT 500) AS _rows',
      command_text
    ) INTO result_rows;
    RETURN jsonb_build_object('kind', 'rows', 'rows', COALESCE(result_rows, '[]'::jsonb), 'row_limit', 500);
  END IF;
  EXECUTE command_text;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN jsonb_build_object('kind', 'command', 'row_count', affected_rows);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_execute_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_execute_sql(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_execute_sql(text) TO service_role;
