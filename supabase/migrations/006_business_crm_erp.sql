-- Celeris Business | 006 | CRM, inventory ledger and sales foundation
create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  document text,
  notes text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_customers_email_unique
  on public.crm_customers (lower(email)) where email is not null and email <> '';
create index if not exists crm_customers_created_idx on public.crm_customers(created_at desc);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.store_products(id) on delete restrict,
  movement_type text not null check (movement_type in ('in','out','adjustment')),
  quantity integer not null check (quantity > 0),
  previous_quantity integer not null check (previous_quantity >= 0),
  new_quantity integer not null check (new_quantity >= 0),
  reason text not null,
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  customer_id uuid references public.crm_customers(id) on delete set null,
  customer_name text not null,
  customer_email text,
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','refunded','failed')),
  payment_method text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  shipping_amount numeric(12,2) not null default 0 check (shipping_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_orders_created_idx on public.store_orders(created_at desc);
create index if not exists store_orders_status_idx on public.store_orders(status, payment_status);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid references public.store_products(id) on delete set null,
  product_name text not null,
  sku text,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index if not exists store_order_items_order_idx on public.store_order_items(order_id);

drop trigger if exists crm_customers_set_updated_at on public.crm_customers;
create trigger crm_customers_set_updated_at before update on public.crm_customers
for each row execute function public.set_updated_at();
drop trigger if exists store_orders_set_updated_at on public.store_orders;
create trigger store_orders_set_updated_at before update on public.store_orders
for each row execute function public.set_updated_at();

alter table public.crm_customers enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;

drop policy if exists crm_customers_manage on public.crm_customers;
create policy crm_customers_manage on public.crm_customers for all to authenticated
using (public.has_permission('crm.manage') or public.has_permission('crm.read'))
with check (public.has_permission('crm.manage'));
drop policy if exists inventory_movements_read on public.inventory_movements;
create policy inventory_movements_read on public.inventory_movements for select to authenticated
using (public.has_permission('inventory.read') or public.has_permission('inventory.manage'));
drop policy if exists inventory_movements_insert on public.inventory_movements;
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated
with check (public.has_permission('inventory.manage') and created_by = auth.uid());
drop policy if exists store_orders_read on public.store_orders;
create policy store_orders_read on public.store_orders for select to authenticated
using (public.has_permission('orders.read') or public.has_permission('orders.manage'));
drop policy if exists store_orders_manage on public.store_orders;
create policy store_orders_manage on public.store_orders for all to authenticated
using (public.has_permission('orders.manage'))
with check (public.has_permission('orders.manage'));
drop policy if exists store_order_items_read on public.store_order_items;
create policy store_order_items_read on public.store_order_items for select to authenticated
using (exists(select 1 from public.store_orders o where o.id = order_id and (public.has_permission('orders.read') or public.has_permission('orders.manage'))));
drop policy if exists store_order_items_manage on public.store_order_items;
create policy store_order_items_manage on public.store_order_items for all to authenticated
using (public.has_permission('orders.manage'))
with check (public.has_permission('orders.manage'));

grant select, insert, update on public.crm_customers to authenticated;
grant select, insert on public.inventory_movements to authenticated;
grant select, insert, update on public.store_orders, public.store_order_items to authenticated;

-- Inventory changes are atomic and leave an audit trail.
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_quantity integer,
  p_movement_type text,
  p_reason text
) returns public.store_products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.store_products;
  v_new integer;
  v_old integer;
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'Sem permissão para ajustar estoque';
  end if;
  if p_quantity <= 0 then raise exception 'A quantidade deve ser maior que zero'; end if;
  if p_movement_type not in ('in','out','adjustment') then raise exception 'Tipo de movimentação inválido'; end if;
  select * into v_product from public.store_products where id = p_product_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;
  v_old := v_product.stock_quantity;
  v_new := case p_movement_type
    when 'in' then v_product.stock_quantity + p_quantity
    when 'out' then v_product.stock_quantity - p_quantity
    else p_quantity
  end;
  if v_new < 0 then raise exception 'Estoque insuficiente'; end if;
  update public.store_products set stock_quantity = v_new where id = p_product_id returning * into v_product;
  insert into public.inventory_movements(product_id,movement_type,quantity,previous_quantity,new_quantity,reason,created_by)
  values(p_product_id,p_movement_type,p_quantity,v_old,
    v_new, coalesce(nullif(trim(p_reason),''),'Ajuste manual'), auth.uid());
  return v_product;
end;
$$;
revoke all on function public.adjust_product_stock(uuid,integer,text,text) from public;
grant execute on function public.adjust_product_stock(uuid,integer,text,text) to authenticated;

-- Default permission sets for built-in business roles.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='admin'
  and p.key in ('dashboard.read','users.read','users.manage','roles.manage','crm.read','crm.manage','products.read','products.manage','inventory.read','inventory.manage','orders.read','orders.manage','finance.read','finance.manage','purchases.manage','reports.read','store.manage')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='manager'
  and p.key in ('dashboard.read','crm.read','crm.manage','products.read','products.manage','inventory.read','inventory.manage','orders.read','orders.manage','reports.read','finance.read')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key='operator'
  and p.key in ('dashboard.read','crm.read','products.read','inventory.read','orders.read')
on conflict do nothing;
