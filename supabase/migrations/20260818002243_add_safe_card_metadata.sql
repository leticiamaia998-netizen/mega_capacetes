alter table public.orders
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists card_holder text,
  add column if not exists card_installments integer,
  add column if not exists card_status text;

alter table public.orders
  drop constraint if exists orders_card_last4_format;

alter table public.orders
  add constraint orders_card_last4_format
  check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');

comment on column public.orders.card_last4 is
  'Somente os quatro últimos dígitos. Nunca armazenar PAN completo ou CVV.';
