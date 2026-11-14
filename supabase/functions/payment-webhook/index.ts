import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function validSignature(signature: string, requestId: string, dataId: string, secret: string) {
  const fields = new Map<string, string>();
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    fields.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  const ts = fields.get("ts"), v1 = fields.get("v1");
  if (!ts || !v1) return false;
  // Mercado Pago's documented manifest: include only values actually present.
  const manifest = [
    dataId ? "id:" + dataId.toLowerCase() + ";" : "",
    requestId ? "request-id:" + requestId + ";" : "",
    "ts:" + ts + ";",
  ].join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  if (digest.length !== v1.length) return false;
  let mismatch = 0;
  for (let i = 0; i < digest.length; i++) mismatch |= digest.charCodeAt(i) ^ v1.toLowerCase().charCodeAt(i);
  return mismatch === 0;
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const body = await req.json();
    const url = new URL(req.url);
    const signedDataId = url.searchParams.get("data.id") || "";
    const dataId = signedDataId || body?.data?.id || "";
    const signature = req.headers.get("x-signature") || "", requestId = req.headers.get("x-request-id") || "";
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || "", accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";
    if (!dataId || !signature || !secret || !accessToken) return new Response("Missing webhook configuration", { status: 400 });
    if (!await validSignature(signature, requestId, String(signedDataId), secret)) {
      const signatureFields = Object.fromEntries(signature.split(",").map((part) => { const i = part.indexOf("="); return i > 0 ? [part.slice(0, i).trim(), part.slice(i + 1).trim()] : ["unknown", ""]; }));
      console.error("payment-webhook signature mismatch", JSON.stringify({ hasQueryDataId: Boolean(signedDataId), hasBodyDataId: Boolean(body?.data?.id), hasRequestId: Boolean(requestId), hasTimestamp: Boolean(signatureFields.ts), hasV1: Boolean(signatureFields.v1), secretLength: secret.trim().length, liveMode: body?.live_mode, notificationType: body?.type, action: body?.action }));
      return new Response("Invalid signature", { status: 401 });
    }
    const mp = await fetch("https://api.mercadopago.com/v1/orders/" + encodeURIComponent(String(dataId)), { headers: { Authorization: "Bearer " + accessToken } });
    if (!mp.ok) return new Response("Unable to verify Mercado Pago order", { status: 502 });
    const paymentOrder = await mp.json(), external = paymentOrder.external_reference;
    if (!external) return new Response("Missing external reference", { status: 400 });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const total = Number(paymentOrder.total_amount || 0), paid = Number(paymentOrder.total_paid_amount || 0);
    const isPaid = paymentOrder.status === "processed" && paid >= total && total > 0;
    const isFailed = ["cancelled", "expired", "failed"].includes(String(paymentOrder.status));
    const payment = paymentOrder.transactions?.payments?.[0];
    const updates: Record<string, unknown> = { provider_order_id: paymentOrder.id, payment_status: isPaid ? "paid" : isFailed ? "failed" : "pending", payment_method: payment?.payment_method?.id || payment?.payment_method?.type || "mercado_pago", notes: "Mercado Pago: " + (paymentOrder.status || "unknown") + " / " + (paymentOrder.status_detail || "sem detalhe") };
    if (isPaid) updates.status = "confirmed";
    const result = await admin.from("store_orders").update(updates).eq("id", external);
    if (result.error) throw result.error;
    return new Response("ok", { status: 200 });
  } catch (error) { console.error("payment-webhook:", error instanceof Error ? error.message : "unknown"); return new Response("Webhook processing failed", { status: 500 }); }
});
