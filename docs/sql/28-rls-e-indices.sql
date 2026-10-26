-- Aplicação manual. Desempenho: não altera dados nem quem pode ver ou alterar cada registro.
-- 1) Regras RLS passam a calcular auth.uid() uma vez por consulta, e não por linha. Funções que dependem
--    só do usuário (is_admin_master, tinutri_master, has_permission, has_role) também são calculadas uma vez.
-- 2) Índices nas chaves estrangeiras apontadas pelo advisor do Supabase.
-- As expressões foram geradas em 26/10/2026 a partir das regras do projeto ylkiyncsqubuxrtwyxwv.
-- Se alguma regra listada for alterada antes da aplicação, gerar este arquivo novamente.
begin;
set local search_path = public;

alter policy "Admin master views all activity" on public.activity_logs
 using ((select private.is_admin_master((select auth.uid()))));
alter policy "Users insert activity for accessible scope" on public.activity_logs
 with check (((user_id = (select auth.uid())) AND ((client_id IS NULL) OR private.user_can_access_client((select auth.uid()), client_id))));
alter policy "Users view activity of accessible clients" on public.activity_logs
 using (((client_id IS NOT NULL) AND private.user_can_access_client((select auth.uid()), client_id)));
alter policy "Admin master manages clients" on public.clients
 using ((select private.is_admin_master((select auth.uid()))))
 with check ((select private.is_admin_master((select auth.uid()))));
alter policy "Users view accessible clients" on public.clients
 using (private.user_can_access_client((select auth.uid()), id));
alter policy "Admin master manages collaborators" on public.collaborators
 using ((select private.is_admin_master((select auth.uid()))))
 with check ((select private.is_admin_master((select auth.uid()))));
alter policy "Permitted users insert collaborators" on public.collaborators
 with check ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_colaboradores'::text))));
alter policy "Permitted users update collaborators" on public.collaborators
 using ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_colaboradores'::text))))
 with check ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_colaboradores'::text))));
alter policy "Users view collaborators of accessible clients" on public.collaborators
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy master_activation_read on public.contract_activation_jobs
 using ((select private.tinutri_master((select auth.uid()))));
alter policy master_offer_events_read on public.contract_offer_events
 using ((select private.tinutri_master((select auth.uid()))));
alter policy master_offers_read on public.contract_offers
 using ((select private.tinutri_master((select auth.uid()))));
alter policy master_checkouts_read on public.contract_payment_checkouts
 using ((select private.tinutri_master((select auth.uid()))));
alter policy master_webhook_inbox_read on public.contract_webhook_inbox
 using ((select private.tinutri_master((select auth.uid()))));
alter policy "Admin master views all labels" on public.issued_labels
 using ((select private.is_admin_master((select auth.uid()))));
alter policy "Users issue labels for accessible clients" on public.issued_labels
 with check (((issued_by = (select auth.uid())) AND private.user_can_access_client((select auth.uid()), client_id) AND private.client_is_operational(client_id) AND (EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = issued_labels.product_id) AND (p.client_id = issued_labels.client_id) AND (p.active = true)))) AND (EXISTS ( SELECT 1
   FROM collaborators c
  WHERE ((c.id = issued_labels.responsible_id) AND (c.client_id = issued_labels.client_id) AND (c.active = true))))));
alter policy "Users update label status of accessible clients" on public.issued_labels
 using (private.user_can_access_client((select auth.uid()), client_id))
 with check (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Users view labels of accessible clients" on public.issued_labels
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Users insert label events for accessible clients" on public.label_events
 with check ((private.user_can_access_client((select auth.uid()), client_id) AND ((user_id IS NULL) OR (user_id = (select auth.uid())))));
alter policy "Users view label events of accessible clients" on public.label_events
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Managers delete layouts" on public.label_layouts
 using (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Managers insert layouts" on public.label_layouts
 with check (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Managers update layouts" on public.label_layouts
 using (private.can_manage_printing((select auth.uid()), client_id))
 with check (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Users view layouts of accessible clients" on public.label_layouts
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Admin master manages label settings" on public.label_settings
 using ((select private.is_admin_master((select auth.uid()))))
 with check ((select private.is_admin_master((select auth.uid()))));
alter policy "Users view label settings of accessible clients" on public.label_settings
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Admin master manages nutritionist carteira" on public.nutritionist_clients
 using ((select private.is_admin_master((select auth.uid()))))
 with check ((select private.is_admin_master((select auth.uid()))));
alter policy "Nutricionista views own carteira" on public.nutritionist_clients
 using ((nutritionist_user_id = (select auth.uid())));
alter policy "Managers delete print agents" on public.print_agents
 using (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Managers update print agents" on public.print_agents
 using (private.can_manage_printing((select auth.uid()), client_id))
 with check (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Managers view print agents" on public.print_agents
 using (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Users cancel pending print jobs" on public.print_jobs
 using (((status = 'pendente'::text) AND private.user_can_access_client((select auth.uid()), client_id)))
 with check (((status = 'cancelada'::text) AND private.user_can_access_client((select auth.uid()), client_id)));
alter policy "Users enqueue print jobs for accessible clients" on public.print_jobs
 with check (((created_by = (select auth.uid())) AND (status = 'pendente'::text) AND private.user_can_access_client((select auth.uid()), client_id) AND private.client_is_operational(client_id) AND (EXISTS ( SELECT 1
   FROM printers p
  WHERE ((p.id = print_jobs.printer_id) AND (p.client_id = print_jobs.client_id) AND p.active)))));
alter policy "Users view print jobs of accessible clients" on public.print_jobs
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Managers delete printers" on public.printers
 using (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Managers insert printers" on public.printers
 with check (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Managers update printers" on public.printers
 using (private.can_manage_printing((select auth.uid()), client_id))
 with check (private.can_manage_printing((select auth.uid()), client_id));
alter policy "Users view printers of accessible clients" on public.printers
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Admin master manages products" on public.products
 using ((select private.is_admin_master((select auth.uid()))))
 with check ((select private.is_admin_master((select auth.uid()))));
alter policy "Permitted users delete products" on public.products
 using ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_produtos'::text))));
alter policy "Permitted users insert products" on public.products
 with check ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_produtos'::text))));
alter policy "Permitted users update products" on public.products
 using ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_produtos'::text))))
 with check ((private.user_can_access_client((select auth.uid()), client_id) AND (select private.has_permission((select auth.uid()), 'gerir_produtos'::text))));
alter policy "Users view products of accessible clients" on public.products
 using (private.user_can_access_client((select auth.uid()), client_id));
alter policy "Admin master manages profiles" on public.profiles
 using ((select private.is_admin_master((select auth.uid()))))
 with check ((select private.is_admin_master((select auth.uid()))));
alter policy "Users update own profile" on public.profiles
 using ((user_id = (select auth.uid())))
 with check ((user_id = (select auth.uid())));
alter policy "Users view own or accessible profiles" on public.profiles
 using (((user_id = (select auth.uid())) OR (select private.is_admin_master((select auth.uid()))) OR ((client_id IS NOT NULL) AND private.user_can_access_client((select auth.uid()), client_id))));
alter policy "Users delete own push subscriptions" on public.push_subscriptions
 using ((user_id = (select auth.uid())));
alter policy "Users view own push subscriptions" on public.push_subscriptions
 using ((user_id = (select auth.uid())));
alter policy master_contracts on public.service_contracts
 using ((select private.tinutri_master((select auth.uid()))))
 with check ((select private.tinutri_master((select auth.uid()))));
alter policy "Users view own roles" on public.user_roles
 using (((user_id = (select auth.uid())) OR (select private.has_role((select auth.uid()), 'admin'::app_role))));

create index if not exists activity_logs_user_id_fk_idx on public.activity_logs(user_id);
create index if not exists care_records_created_by_fk_idx on public.care_records(created_by);
create index if not exists care_records_updated_by_fk_idx on public.care_records(updated_by);
create index if not exists contract_activation_jobs_user_id_fk_idx on public.contract_activation_jobs(user_id);
create index if not exists contract_offers_created_by_fk_idx on public.contract_offers(created_by);
create index if not exists contract_own_acceptances_actor_id_fk_idx on public.contract_own_acceptances(actor_id);
create index if not exists contract_webhook_inbox_last_retry_by_fk_idx on public.contract_webhook_inbox(last_retry_by);
create index if not exists issued_labels_closed_by_fk_idx on public.issued_labels(closed_by);
create index if not exists issued_labels_issued_by_user_id_fk_idx on public.issued_labels(issued_by_user_id);
create index if not exists issued_labels_product_id_fk_idx on public.issued_labels(product_id);
create index if not exists issued_labels_responsible_id_fk_idx on public.issued_labels(responsible_id);
create index if not exists label_events_client_id_fk_idx on public.label_events(client_id);
create index if not exists nutritionist_clients_client_id_fk_idx on public.nutritionist_clients(client_id);
create index if not exists print_jobs_printer_id_fk_idx on public.print_jobs(printer_id);
create index if not exists products_created_by_fk_idx on public.products(created_by);
create index if not exists products_updated_by_fk_idx on public.products(updated_by);
create index if not exists service_contracts_created_by_fk_idx on public.service_contracts(created_by);

-- Nenhuma regra do schema public pode continuar chamando auth.uid() fora de um select.
do $$
declare remaining text;
begin
 select string_agg(format('%s.%s', tablename, policyname), ', ') into remaining from pg_catalog.pg_policies
 where schemaname='public' and (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ '(?<!SELECT )auth\.uid\(\)';
 if remaining is not null then raise exception 'Regras ainda sem (select auth.uid()): %', remaining; end if;
end $$;
commit;
