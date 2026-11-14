-- Celeris Business | 008 | Inventory adjustment semantics
-- Purchase = stock entry, Sale = stock exit, Inventory = set physical balance.
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
  v_logged_quantity integer;
begin
  if not public.has_permission('inventory.manage') then
    raise exception 'Sem permissão para ajustar estoque';
  end if;
  if p_movement_type not in ('in','out','adjustment') then
    raise exception 'Tipo de movimentação inválido';
  end if;
  if p_quantity < 0 or (p_quantity = 0 and p_movement_type <> 'adjustment') then
    raise exception 'Informe uma quantidade válida';
  end if;
  select * into v_product
    from public.store_products
    where id = p_product_id
    for update;
  if not found then raise exception 'Produto não encontrado'; end if;

  v_old := v_product.stock_quantity;
  v_new := case p_movement_type
    when 'in' then v_old + p_quantity
    when 'out' then v_old - p_quantity
    else p_quantity
  end;
  if v_new < 0 then raise exception 'Estoque insuficiente'; end if;

  update public.store_products
    set stock_quantity = v_new
    where id = p_product_id
    returning * into v_product;

  -- inventory_movements.quantity must be positive; for a no-change count
  -- store 1 while previous_quantity/new_quantity preserve the actual result.
  v_logged_quantity := case
    when p_movement_type = 'adjustment' then greatest(abs(v_new - v_old), 1)
    else p_quantity
  end;

  insert into public.inventory_movements(
    product_id, movement_type, quantity, previous_quantity, new_quantity,
    reason, created_by
  ) values (
    p_product_id, p_movement_type, v_logged_quantity, v_old, v_new,
    coalesce(nullif(trim(p_reason),''),'Ajuste manual'), auth.uid()
  );
  return v_product;
end;
$$;

revoke all on function public.adjust_product_stock(uuid,integer,text,text) from public;
grant execute on function public.adjust_product_stock(uuid,integer,text,text) to authenticated;
