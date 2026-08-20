-- MegaCapacetes — compatibilidade de status com o painel admin
-- O painel só entende status: pending | paid | cancelled | refunded.
-- Qualquer outro valor (cartao_recusado, abandonou, checkout_iniciado...) derruba a tela.
-- Aqui o status fica sempre compatível e o detalhe do fluxo vai para status_detalhe.
-- Pode rodar quantas vezes precisar.

alter table public.orders add column if not exists status_detalhe text;

alter table public.orders alter column status set default 'pending';
alter table public.orders alter column valor set default 0;

create index if not exists orders_status_detalhe_idx on public.orders(status_detalhe);

create or replace function public.normalize_order_status()
returns trigger language plpgsql as $$
declare
  bruto text;
begin
  bruto := lower(coalesce(nullif(trim(new.status), ''), 'pending'));

  -- status granular (cartao_recusado, abandonou, pix_gerado...) vira detalhe;
  -- status já compatível respeita o detalhe que a aplicação mandou.
  if bruto in ('pending', 'paid', 'cancelled', 'refunded') then
    new.status_detalhe := coalesce(nullif(trim(coalesce(new.status_detalhe, '')), ''), bruto);
  else
    new.status_detalhe := bruto;
  end if;

  new.status := case
    when bruto in ('paid', 'pago', 'approved', 'aprovado', 'completed', 'authorized') then 'paid'
    when bruto in ('cancelled', 'canceled', 'cancelado', 'expired', 'expirado') then 'cancelled'
    when bruto in ('refunded', 'reembolsado', 'estornado', 'chargeback') then 'refunded'
    else 'pending'
  end;
  new.valor := coalesce(new.valor, 0);

  return new;
end;
$$;

drop trigger if exists normalize_order_status_trigger on public.orders;
create trigger normalize_order_status_trigger
  before insert or update of status on public.orders
  for each row execute function public.normalize_order_status();

alter function public.normalize_order_status() set search_path = public, pg_temp;

-- Conserta os pedidos que já estão no banco (é o que deixa o painel em branco hoje).
update public.orders
set status_detalhe = coalesce(status_detalhe, lower(status))
where status_detalhe is null;

update public.orders
set status = case
  when lower(coalesce(status, '')) in ('paid', 'pago', 'approved', 'aprovado', 'completed', 'authorized') then 'paid'
  when lower(coalesce(status, '')) in ('cancelled', 'canceled', 'cancelado', 'expired', 'expirado') then 'cancelled'
  when lower(coalesce(status, '')) in ('refunded', 'reembolsado', 'estornado', 'chargeback') then 'refunded'
  else 'pending'
end
where lower(coalesce(status, '')) not in ('pending', 'paid', 'cancelled', 'refunded');

update public.orders set valor = 0 where valor is null;
