-- Corrige o painel administrativo da MegaCapacetes e restringe as
-- operações administrativas exclusivamente a usuários autenticados
-- presentes em public.user_roles com role = 'admin'.

alter table public.orders
  add column if not exists paid_at timestamptz;

create index if not exists user_roles_user_id_role_idx
  on public.user_roles (user_id, role);

drop policy if exists "users_read_own_role" on public.user_roles;
create policy "users_read_own_role"
  on public.user_roles
  for select
  to authenticated
  using ((select auth.uid()) is not null and user_id = (select auth.uid()));

drop policy if exists "admin_orders_all" on public.orders;
create policy "admin_orders_all"
  on public.orders
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.user_roles
      where user_id = (select auth.uid())
        and role = 'admin'
    )
  );

drop policy if exists "admin_notifications_all" on public.notifications;
create policy "admin_notifications_all"
  on public.notifications
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

-- A service role ignora RLS. Esta política antiga, atribuída a public,
-- permitia inserção anônima e não é necessária.
drop policy if exists "service_role_notifications_insert" on public.notifications;

drop policy if exists "admin_payment_gateways_all" on public.payment_gateways;
create policy "admin_payment_gateways_all"
  on public.payment_gateways
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

drop policy if exists "admin_price_overrides_all" on public.price_overrides;
create policy "admin_price_overrides_all"
  on public.price_overrides
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

drop policy if exists "admin_pix_errors_select" on public.pix_errors;
create policy "admin_pix_errors_select"
  on public.pix_errors
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = (select auth.uid()) and role = 'admin'
    )
  );

-- Elimina os avisos de search_path mutável sem tornar as funções
-- SECURITY DEFINER nem ampliar privilégios.
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.sync_order_status() set search_path = public, pg_temp;
alter function public.sync_notification_is_read() set search_path = public, pg_temp;
alter function public.sync_order_customer() set search_path = public, pg_temp;
