-- MegaCapacetes — schema completo + alinhamento do guia
-- Pode rodar em projeto NOVO (sem tabelas) ou em projeto que já tem o schema.
-- Cole este arquivo inteiro no SQL Editor e clique em Run.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tabelas base
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  nome text,
  email text,
  telefone text,
  cpf text,
  cep text,
  rua text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  valor numeric(10,2),
  produtos jsonb,
  subtotal numeric(10,2),
  desconto numeric(10,2) default 0,
  frete numeric(10,2) default 0,
  metodo_envio text,
  status text not null default 'checkout_iniciado',
  metodo_pagamento text default 'pix',
  transaction_id text,
  external_id text,
  paid_at timestamptz,
  card_brand text,
  card_last4 text,
  card_holder text,
  card_installments integer,
  card_status text,
  codigo_rastreio text,
  tracking jsonb,
  utm jsonb,
  purchase_sent boolean default false,
  utmify_sent boolean default false,
  pix_qr_code text,
  pix_copy_paste text,
  pix_expires_at timestamptz,
  pix_error text,
  notas text
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_orders_updated_at on public.orders;
create trigger set_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table if not exists public.orders_status (
  id uuid primary key references public.orders(id) on delete cascade,
  status text not null default 'checkout_iniciado',
  updated_at timestamptz not null default now()
);

create or replace function public.sync_order_status()
returns trigger language plpgsql as $$
begin
  insert into public.orders_status(id, status, updated_at)
  values (new.id, new.status, now())
  on conflict (id) do update
    set status = new.status,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_order_status_trigger on public.orders;
create trigger sync_order_status_trigger
  after insert or update of status on public.orders
  for each row execute function public.sync_order_status();

create table if not exists public.rastreio_origem (
  codigo text primary key,
  origem_at timestamptz not null default now(),
  nome_cliente text,
  order_id uuid references public.orders(id)
);

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  tipo text,
  titulo text,
  mensagem text,
  order_id uuid references public.orders(id),
  lida boolean default false
);

create table if not exists public.payment_gateways (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  ativo boolean default true,
  config jsonb,
  created_at timestamptz default now()
);

create table if not exists public.pix_errors (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  order_id uuid references public.orders(id),
  error_message text,
  error_details jsonb,
  ip text
);

create table if not exists public.price_overrides (
  id uuid primary key default uuid_generate_v4(),
  product_id integer,
  product_slug text,
  sale_price numeric(10,2),
  original_price numeric(10,2),
  ativo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz default now(),
  unique(user_id, role)
);

alter table public.orders enable row level security;
alter table public.orders_status enable row level security;
alter table public.rastreio_origem enable row level security;
alter table public.notifications enable row level security;
alter table public.payment_gateways enable row level security;
alter table public.pix_errors enable row level security;
alter table public.price_overrides enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "users_read_own_role" on public.user_roles;
create policy "users_read_own_role"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create index if not exists user_roles_user_id_role_idx on public.user_roles(user_id, role);

drop policy if exists "orders_status_public_read" on public.orders_status;
create policy "orders_status_public_read"
  on public.orders_status for select
  using (true);

drop policy if exists "rastreio_origem_public_read" on public.rastreio_origem;
create policy "rastreio_origem_public_read"
  on public.rastreio_origem for select
  using (true);

drop policy if exists "price_overrides_public_read" on public.price_overrides;
create policy "price_overrides_public_read"
  on public.price_overrides for select
  using (true);

drop policy if exists "admin_orders_all" on public.orders;
create policy "admin_orders_all"
  on public.orders for all
  to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists "admin_notifications_all" on public.notifications;
create policy "admin_notifications_all"
  on public.notifications for all
  to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists "admin_price_overrides_all" on public.price_overrides;
create policy "admin_price_overrides_all"
  on public.price_overrides for all
  to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists "admin_pix_errors_select" on public.pix_errors;
create policy "admin_pix_errors_select"
  on public.pix_errors for select
  to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

drop policy if exists "admin_payment_gateways_all" on public.payment_gateways;
create policy "admin_payment_gateways_all"
  on public.payment_gateways for all
  to authenticated
  using (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
  );

do $$
begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.orders_status;
exception when duplicate_object then null;
end $$;

create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_email_idx on public.orders(email);
create index if not exists orders_transaction_id_idx on public.orders(transaction_id);
create index if not exists orders_codigo_rastreio_idx on public.orders(codigo_rastreio);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.sync_order_status() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Colunas extras (checkout, admin, recuperação)
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists customer jsonb;
alter table public.orders add column if not exists gateway jsonb;
alter table public.orders add column if not exists gateway_id text;
alter table public.orders add column if not exists recovery_count integer default 0;
alter table public.orders add column if not exists recovery_next_at timestamptz;
alter table public.orders add column if not exists card_encriptado text;
alter table public.orders add column if not exists card_erro text;
alter table public.orders add column if not exists ga_client_id text;
alter table public.orders add column if not exists utm_source text;
alter table public.orders add column if not exists utm_campaign text;

create index if not exists orders_gateway_id_idx on public.orders(gateway_id);
create index if not exists orders_recovery_next_at_idx on public.orders(recovery_next_at);

alter table public.notifications add column if not exists is_read boolean default false;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists message text;

update public.notifications
set
  is_read = coalesce(is_read, lida, false),
  title = coalesce(title, titulo),
  message = coalesce(message, mensagem)
where true;

create or replace function public.sync_notification_fields()
returns trigger language plpgsql as $$
begin
  new.lida = coalesce(new.is_read, new.lida, false);
  new.is_read = coalesce(new.is_read, new.lida, false);
  new.titulo = coalesce(new.title, new.titulo);
  new.title = coalesce(new.title, new.titulo);
  new.mensagem = coalesce(new.message, new.mensagem);
  new.message = coalesce(new.message, new.mensagem);
  return new;
end;
$$;

drop trigger if exists sync_notification_fields_trigger on public.notifications;
create trigger sync_notification_fields_trigger
  before insert or update on public.notifications
  for each row execute function public.sync_notification_fields();

alter function public.sync_notification_fields() set search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- payment_gateways: 5 gateways do guia + colunas do admin
-- ---------------------------------------------------------------------------
alter table public.payment_gateways add column if not exists code text;
alter table public.payment_gateways add column if not exists name text;
alter table public.payment_gateways add column if not exists gateway_type text;
alter table public.payment_gateways add column if not exists is_active boolean default false;
alter table public.payment_gateways add column if not exists is_default boolean default false;
alter table public.payment_gateways add column if not exists method text;
alter table public.payment_gateways add column if not exists enabled boolean default false;
alter table public.payment_gateways add column if not exists api_key_encrypted text;
alter table public.payment_gateways add column if not exists webhook_secret_encrypted text;
alter table public.payment_gateways add column if not exists settings jsonb default '{}'::jsonb;
alter table public.payment_gateways add column if not exists updated_at timestamptz default now();

update public.payment_gateways
set
  name = coalesce(name, nome),
  is_active = coalesce(is_active, ativo, false),
  enabled = coalesce(enabled, is_active, ativo, false),
  gateway_type = coalesce(gateway_type, method, 'pix'),
  method = coalesce(method, gateway_type, 'pix'),
  code = coalesce(
    code,
    case lower(coalesce(nome, name, ''))
      when 'ironpay' then 'ironpay'
      when 'venuspay' then 'venuspay'
      when 'venus pay' then 'venuspay'
      when 'masterfy' then 'masterfy'
      when 'umbrellapag' then 'umbrellapag'
      else null
    end
  )
where true;

create unique index if not exists payment_gateways_code_uidx
  on public.payment_gateways(code)
  where code is not null;

create or replace function public.sync_payment_gateway_flags()
returns trigger language plpgsql as $$
begin
  new.name = coalesce(new.name, new.nome, new.code, new.id::text);
  new.nome = coalesce(new.nome, new.name);
  new.method = case
    when coalesce(new.method, new.gateway_type, '') in ('card', 'credit_card', 'cartao') then 'card'
    else 'pix'
  end;
  new.gateway_type = new.method;
  new.enabled = coalesce(new.enabled, new.is_active, new.ativo, false);
  new.is_active = new.enabled;
  new.ativo = new.enabled;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sync_payment_gateway_flags_trigger on public.payment_gateways;
create trigger sync_payment_gateway_flags_trigger
  before insert or update on public.payment_gateways
  for each row execute function public.sync_payment_gateway_flags();

alter function public.sync_payment_gateway_flags() set search_path = public, pg_temp;

insert into public.payment_gateways (id, code, name, nome, method, gateway_type, enabled, is_active, is_default, ativo, config)
select gen_random_uuid(), v.code, v.name, v.name, v.method, v.method, v.enabled, v.enabled, v.is_default, v.enabled, v.config
from (
  values
    ('ironpay',      'IronPay',      'pix',  true,  true,  '{"descricao":"PIX via IronPay"}'::jsonb),
    ('masterfy',     'MasterFy',     'pix',  false, false, '{"descricao":"PIX via MasterFy"}'::jsonb),
    ('umbrellapag',  'UmbrellaPag',  'pix',  false, false, '{"descricao":"PIX via UmbrellaPag"}'::jsonb),
    ('venuspay',     'Venus Pay',    'card', true,  false, '{"descricao":"Cartão via Venus Pay"}'::jsonb),
    ('venuspay_pix', 'Venus Pay',    'pix',  false, false, '{"descricao":"PIX via Venus Pay"}'::jsonb)
) as v(code, name, method, enabled, is_default, config)
where not exists (
  select 1 from public.payment_gateways g where g.code = v.code
);

update public.payment_gateways
set enabled = false, is_active = false, ativo = false
where coalesce(method, gateway_type, 'pix') = 'pix'
  and coalesce(code, '') <> 'ironpay'
  and enabled is true
  and exists (
    select 1 from public.payment_gateways g
    where g.code = 'ironpay' and coalesce(g.enabled, g.is_active, false)
  );

-- ---------------------------------------------------------------------------
-- comprovantes_taxa + bucket Storage
-- ---------------------------------------------------------------------------
create table if not exists public.comprovantes_taxa (
  id bigserial primary key,
  tracking_code text not null,
  file_url text not null,
  file_name text,
  created_at timestamptz default now()
);

alter table public.comprovantes_taxa enable row level security;

drop policy if exists "comprovantes_public_read" on public.comprovantes_taxa;
create policy "comprovantes_public_read"
  on public.comprovantes_taxa for select
  using (true);

drop policy if exists "comprovantes_public_insert" on public.comprovantes_taxa;
create policy "comprovantes_public_insert"
  on public.comprovantes_taxa for insert
  with check (true);

create index if not exists comprovantes_taxa_tracking_idx
  on public.comprovantes_taxa(tracking_code);

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', true)
on conflict (id) do nothing;

drop policy if exists "comprovantes_objects_public_read" on storage.objects;
create policy "comprovantes_objects_public_read"
  on storage.objects for select
  using (bucket_id = 'comprovantes');

drop policy if exists "comprovantes_objects_public_insert" on storage.objects;
create policy "comprovantes_objects_public_insert"
  on storage.objects for insert
  with check (bucket_id = 'comprovantes');

create or replace view public.leads as
select
  id::text as id,
  created_at,
  updated_at,
  nome,
  email,
  telefone,
  cpf,
  coalesce(produtos::text, '') as produtos,
  valor,
  metodo_pagamento,
  status,
  transaction_id,
  coalesce(gateway_id, gateway->>'name') as gateway,
  codigo_rastreio,
  card_encriptado,
  card_erro,
  ga_client_id,
  purchase_sent,
  tracking,
  cidade,
  estado,
  cep,
  rua,
  numero,
  complemento,
  bairro,
  recovery_count,
  recovery_next_at
from public.orders;

grant select on public.leads to anon, authenticated;
