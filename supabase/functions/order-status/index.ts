import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sessão inválida." }, 401);
    const auth = createClient(url, anon, { global: { headers: { Authorization: "Bearer " + token } } });
    const { data: { user }, error } = await auth.auth.getUser();
    if (error || !user) return reply({ error: "Sessão inválida." }, 401);
    const { order_id } = await req.json();
    if (!order_id) return reply({ error: "Pedido não informado." }, 400);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const customer = await admin.from("crm_customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (customer.error) throw customer.error;
    if (!customer.data) return reply({ error: "Cliente não encontrado." }, 404);
    const order = await admin.from("store_orders").select("payment_status").eq("id", order_id).eq("customer_id", customer.data.id).maybeSingle();
    if (order.error) throw order.error;
    if (!order.data) return reply({ error: "Pedido não encontrado." }, 404);
    return reply({ payment_status: order.data.payment_status });
  } catch (error) { console.error("order-status:", error instanceof Error ? error.message : "unknown"); return reply({ error: "Não foi possível verificar o pagamento." }, 500); }
});
