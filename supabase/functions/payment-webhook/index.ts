import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function validSignature(signature: string, requestId: string, dataId: string, secret: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!parts.ts || !parts.v1) return false;
  const manifest = "id:" + dataId.toLowerCase() + ";request-id:" + requestId + ";ts:" + parts.ts + ";";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  return hex(digest) === parts.v1.toLowerCase();
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.json(), dataId = new URL(req.url).searchParams.get("data.id") || body?.data?.id;
    const signature = req.headers.get("x-signature") || "", requestId = req.headers.get("x-request-id") || "";
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || "", accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
    if (!dataId || !signature || !requestId || !secret || !accessToken) return new Response("Missing webhook configuration", { status: 400 });
    if (!await validSignature(signature, requestId, String(dataId), secret)) return new Response("Invalid signature", { status: 401 });
    const mp = await fetch("https://api.mercadopago.com/v1/orders/" + encodeURIComponent(String(dataId)), { headers: { Authorization: "Bearer " + accessToken } });
    if (!mp.ok) return new Response("Unable to verify Mercado Pago order", { status: 502 });
    const paymentOrder = await mp.json(), external = paymentOrder.external_reference;
    if (!external) return new Response("Missing external reference", { status: 400 });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const total = Number(paymentOrder.total_amount || 0), paid = Number(paymentOrder.total_paid_amount || 0);
    const isPaid = paymentOrder.status === "processed" && paid >= total && total > 0;
    const isFailed = ["cancelled", "expired", "failed"].includes(String(paymentOrder.status));
    const payment = paymentOrder.transactions?.payments?.[0];
    const updates: Record<string, unknown> = { provider_order_id: paymentOrder.id, payment_status: isPaid ? "paid" : isFailed ? "failed" : "pending", payment_method: payment?.payment_method?.type || "mercado_pago", notes: "Mercado Pago: " + (paymentOrder.status || "unknown") + " / " + (paymentOrder.status_detail || "sem detalhe") };
    if (isPaid) updates.status = "confirmed";
    const result = await admin.from("store_orders").update(updates).eq("id", external);
    if (result.error) throw result.error;
    return new Response("ok", { status: 200 });
  } catch (error) { console.error("payment-webhook:", error instanceof Error ? error.message : "unknown"); return new Response("Webhook processing failed", { status: 500 }); }
});