begin;

-- Los 17 documentos de producción tienen ambos campos legacy a NULL. Los
-- binarios viven exclusivamente en el bucket privado y la tabla conserva rutas.
alter table public.documents
  drop column file_data_url,
  drop column template_data_url;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'documents') then
    raise exception 'Required private bucket documents does not exist';
  end if;
end
$$;

update storage.buckets
set file_size_limit = 20971520,
    public = false
where id = 'documents';

commit;
