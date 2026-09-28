alter table public.crm_leads
  add column if not exists crm_stage text not null default 'Por contactar'
    check (crm_stage in ('Por contactar','Contactado','Propuesta enviada','Llamada programada','Llamada tenida','En espera','Cliente','Lost')),
  add column if not exists lost_at date;

update public.crm_leads
set crm_stage = case
  when lifecycle in ('LOST', 'LOST 25-26') then 'Lost'
  when lifecycle = 'INSIDE' then 'Cliente'
  else 'Por contactar'
end;

create policy "Authenticated admins can read CRM leads"
on public.crm_leads for select to authenticated using (true);
create policy "Authenticated admins can update CRM leads"
on public.crm_leads for update to authenticated using (true) with check (true);
create policy "Authenticated admins can insert CRM leads"
on public.crm_leads for insert to authenticated with check (true);

create policy "Authenticated admins can read lead applications"
on public.crm_lead_applications for select to authenticated using (true);
create policy "Authenticated admins can manage lead applications"
on public.crm_lead_applications for all to authenticated using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.crm_leads;
exception when duplicate_object then null;
end $$;
