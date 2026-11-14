import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return reply({ error: "Faça login para comprar." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = authHeader.replace(/^Bearer\\s+/i, "");
    const authClient = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } } });
    const authResult = await authClient.auth.getUser();
    if (authResult.error || !authResult.data.user) return reply({ error: "Sessão inválida. Entre novamente." }, 401);
    const user = authResult.data.user;
    const body = await req.json(), items = body.items, address = body.shipping_address;
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) return reply({ error: "Carrinho inválido." }, 400);
    const required = ["phone","cep","street","number","neighborhood","city","state"];
    if (!address || required.some((k) => !String(address[k] || "").trim())) return reply({ error: "Preencha os dados de entrega." }, 400);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const ids = [...new Set(items.map((x: any) => String(x.product_id)))];
    const productResult = await admin.from("store_products").select("id,name,price,is_active,store_product_variants(id,name,price,is_active)").in("id", ids);
    if (productResult.error) throw productResult.error;
    const products = new Map((productResult.data || []).map((p: any) => [p.id, p]));
    const normalized: any[] = []; let subtotal = 0;
    for (const line of items) {
      const product: any = products.get(line.product_id), qty = Number(line.quantity);
      if (!product || !product.is_active || !Number.isInteger(qty) || qty < 1 || qty > 50) return reply({ error: "Um produto não está mais disponível." }, 400);
      let variant: any = null;
      if (line.variant_id) { variant = (product.store_product_variants || []).find((v: any) => v.id === line.variant_id && v.is_active); if (!variant) return reply({ error: "Uma variação não está mais disponível." }, 400); }
      const unit = Number(variant?.price ?? product.price); subtotal += unit * qty;
      normalized.push({ product_id: product.id, variant_id: variant?.id ?? null, product_name: product.name + (variant ? " — " + variant.name : ""), sku: null, unit_price: unit, quantity: qty, line_total: unit * qty });
    }
    if (!Number.isFinite(subtotal) || subtotal <= 0) return reply({ error: "Valor inválido." }, 400);
    const customerName = String(user.user_metadata?.full_name || user.email?.split("@")[0] || "Cliente");
    const customer = await admin.from("crm_customers").upsert({ auth_user_id: user.id, full_name: customerName, email: user.email, phone: String(address.phone) }, { onConflict: "auth_user_id" }).select("id").single();
    if (customer.error) throw customer.error;
    const orderResult = await admin.from("store_orders").insert({ customer_id: customer.data.id, customer_name: customerName, customer_email: user.email, status: "pending", payment_status: "pending", payment_method: "mercado_pago", payment_provider: "mercado_pago", subtotal, shipping_amount: 0, total: subtotal, shipping_address: address, notes: "Frete não incluído; combinar valor e entrega com o cliente." }).select("id,order_number").single();
    if (orderResult.error) throw orderResult.error;
    const order = orderResult.data;
    const lines = await admin.from("store_order_items").insert(normalized.map((line) => ({ ...line, order_id: order.id })));
    if (lines.error) throw lines.error;
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!accessToken) return reply({ error: "Configure MERCADOPAGO_ACCESS_TOKEN nos secrets do Supabase." }, 503);
    const origin = req.headers.get("origin") || "https://store.celeris.com.br";
    const mp = await fetch("https://api.mercadopago.com/v1/orders", { method: "POST", headers: { Authorization: "Bearer " + accessToken, "Content-Type": "application/json", "X-Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({
      type: "online", processing_mode: "manual", capture_mode: "automatic_async", total_amount: subtotal.toFixed(2), external_reference: order.id,
      description: "Celeris Store - Pedido #" + order.order_number, payer: { email: user.email },
      items: normalized.map((line) => ({ title: line.product_name, quantity: line.quantity, unit_price: line.unit_price.toFixed(2) })),
      config: { online: { success_url: origin + "/?payment=success&order=" + order.id, failure_url: origin + "/?payment=failure&order=" + order.id, pending_url: origin + "/?payment=pending&order=" + order.id, auto_return: "approved" } }
    }) });
    const mpOrder = await mp.json();
    if (!mp.ok || !mpOrder.checkout_url) { await admin.from("store_orders").update({ payment_status: "failed", notes: "Falha ao criar cobrança no Mercado Pago." }).eq("id", order.id); return reply({ error: mpOrder.message || "Falha ao criar pagamento." }, 502); }
    await admin.from("store_orders").update({ provider_order_id: mpOrder.id, provider_reference: order.id }).eq("id", order.id);
    return reply({ checkout_url: mpOrder.checkout_url, order_id: order.id, order_number: order.order_number });
  } catch (error) { console.error("create-checkout:", error instanceof Error ? error.message : "unknown"); return reply({ error: "Não foi possível iniciar o pagamento." }, 500); }
});