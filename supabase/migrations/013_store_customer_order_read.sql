-- Allow signed-in customers to read only their own order status.
-- The storefront uses this permission to detect payment confirmation and clear the cart.
drop policy if exists store_orders_customer_read on public.store_orders;
create policy store_orders_customer_read
on public.store_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.crm_customers c
    where c.id = store_orders.customer_id
      and c.auth_user_id = (select auth.uid())
  )
);
