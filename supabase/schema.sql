-- ============================================================
-- MEGACAPACETES — SCHEMA COMPLETO SUPABASE
-- Execute este arquivo inteiro no SQL Editor do Supabase
-- ============================================================

-- ============================
-- EXTENSÕES
-- ============================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================
-- TABELA: orders (pedidos principais)
-- ============================
create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- cliente
  nome text,
  email text,
  telefone text,
  cpf text,

  -- endereço
  cep text,
  rua text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,

  -- pedido
  valor numeric(10,2),
  produtos jsonb,         -- array de itens [{name, quantity, price}]
  subtotal numeric(10,2),
  desconto numeric(10,2) default 0,
  frete numeric(10,2) default 0,
  metodo_envio text,

  -- pagamento
  status text not null default 'checkout_iniciado',
  -- Valores: checkout_iniciado | pix_gerado | pago | cancelado | abandonou
  metodo_pagamento text default 'pix',
  transaction_id text,       -- ID da transação na IronPay
  external_id text,          -- ID externo/gateway
  paid_at timestamptz,

  -- rastreio
  codigo_rastreio text,
  tracking jsonb,            -- objeto de rastreio fake gerado no checkout

  -- marketing
  utm jsonb,                 -- {utm_source, utm_medium, utm_campaign, ...}
  purchase_sent boolean default false,   -- FB Purchase enviado?
  utmify_sent boolean default false,

  -- pix
  pix_qr_code text,
  pix_copy_paste text,
  pix_expires_at timestamptz,
  pix_error text,

  -- admin
  notas text
);

-- Trigger para atualizar updated_at automaticamente
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

-- ============================
-- TABELA: orders_status (para polling leve de status)
-- ============================
create table if not exists public.orders_status (
  id uuid primary key references public.orders(id) on delete cascade,
  status text not null default 'checkout_iniciado',
  updated_at timestamptz not null default now()
);

-- Trigger: manter orders_status sincronizado com orders
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

-- ============================
-- TABELA: rastreio_origem (para a página de rastreio)
-- ============================
create table if not exists public.rastreio_origem (
  codigo text primary key,
  origem_at timestamptz not null default now(),
  nome_cliente text,
  order_id uuid references public.orders(id)
);

-- ============================
-- TABELA: notifications (notificações admin)
-- ============================
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  tipo text,          -- 'novo_pedido' | 'pagamento_confirmado' | 'erro_pix'
  titulo text,
  mensagem text,
  order_id uuid references public.orders(id),
  lida boolean default false
);

-- ============================
-- TABELA: payment_gateways (configuração dos gateways)
-- ============================
create table if not exists public.payment_gateways (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,         -- 'ironpay' | 'venusPay'
  ativo boolean default true,
  config jsonb,               -- configurações específicas (não-secretas)
  created_at timestamptz default now()
);

-- Inserir gateways padrão
insert into public.payment_gateways (nome, ativo, config)
values
  ('ironpay', true, '{"descricao": "PIX via IronPay"}'::jsonb),
  ('venusPay', false, '{"descricao": "Cartão via Venus Pay"}'::jsonb)
on conflict do nothing;

-- ============================
-- TABELA: pix_errors (log de erros de PIX)
-- ============================
create table if not exists public.pix_errors (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  order_id uuid references public.orders(id),
  error_message text,
  error_details jsonb,
  ip text
);

-- ============================
-- TABELA: price_overrides (preços customizados por produto)
-- ============================
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

-- ============================
-- TABELA: user_roles (admin access)
-- ============================
create table if not exists public.user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz default now(),
  unique(user_id, role)
);

-- ============================
-- ROW LEVEL SECURITY (RLS)
-- ============================

-- orders: somente service role pode ler/escrever (Edge Functions usam service role)
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

create index if not exists user_roles_user_id_role_idx
  on public.user_roles(user_id, role);

-- Políticas públicas de leitura (para o frontend anonimamente ler orders_status)
drop policy if exists "orders_status_public_read" on public.orders_status;
create policy "orders_status_public_read"
  on public.orders_status for select
  using (true);

-- rastreio_origem: leitura pública (para a página de rastreio)
drop policy if exists "rastreio_origem_public_read" on public.rastreio_origem;
create policy "rastreio_origem_public_read"
  on public.rastreio_origem for select
  using (true);

-- price_overrides: leitura pública (para o frontend exibir preços)
drop policy if exists "price_overrides_public_read" on public.price_overrides;
create policy "price_overrides_public_read"
  on public.price_overrides for select
  using (true);

-- Admins podem ler tudo (via user_roles)
drop policy if exists "admin_orders_all" on public.orders;
create policy "admin_orders_all"
  on public.orders for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  );

drop policy if exists "admin_notifications_all" on public.notifications;
create policy "admin_notifications_all"
  on public.notifications for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  );

drop policy if exists "admin_price_overrides_all" on public.price_overrides;
create policy "admin_price_overrides_all"
  on public.price_overrides for all
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  );

drop policy if exists "admin_pix_errors_select" on public.pix_errors;
create policy "admin_pix_errors_select"
  on public.pix_errors for select
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
      and role = 'admin'
    )
  );

-- ============================
-- REALTIME: habilitar para orders (para polling em tempo real na PixPage)
-- ============================
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.orders_status;

-- ============================
-- ÍNDICES para performance
-- ============================
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_email_idx on public.orders(email);
create index if not exists orders_transaction_id_idx on public.orders(transaction_id);
create index if not exists orders_codigo_rastreio_idx on public.orders(codigo_rastreio);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

-- ============================
-- CRIAR USUÁRIO ADMIN
-- ============================
-- ATENÇÃO: Após rodar este schema, crie o usuário admin pelo Supabase Dashboard:
-- Authentication → Users → Add User
-- Email: admin@megacapacetes.store
-- Password: (sua senha forte)
-- Depois rode o INSERT abaixo substituindo o USER_ID_AQUI pelo UUID gerado:
--
-- insert into public.user_roles (user_id, role)
-- values ('USER_ID_AQUI', 'admin');
