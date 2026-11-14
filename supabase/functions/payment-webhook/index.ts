import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function validSignature(
  signature: string,
  requestId: string,
  dataId: string,
  secret: string,
) {
  const fields = new Map<string, string>();
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    fields.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }

  const timestamp = fields.get("ts");
  const receivedHash = fields.get("v1");
  if (!timestamp || !receivedHash) return false;

  // Mercado Pago Orders uses the URL data.id in the signature manifest.
  // Order IDs are case-insensitive for signature generation and must be lowercase.
  const manifest = [
    dataId ? "id:" + dataId.toLowerCase() + ";" : "",
    requestId ? "request-id:" + requestId + ";" : "",
    "ts:" + timestamp + ";",
  ].join("");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)),
  );
  if (digest.length !== receivedHash.length) return false;

  let mismatch = 0;
  for (let index = 0; index < digest.length; index++) {
    mismatch |= digest.charCodeAt(index) ^ receivedHash.toLowerCase().charCodeAt(index);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const url = new URL(req.url);
    const body = await req.json();
    const signedDataId = url.searchParams.get("data.id") || "";
    const dataId = signedDataId || String(body?.data?.id || "");
    const signature = req.headers.get("x-signature") || "";
    const requestId = req.headers.get("x-request-id") || "";
    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || "";
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") || "";

    if (!dataId || !signature || !secret || !accessToken) {
      console.error("payment-webhook missing required input", JSON.stringify({
        hasDataId: Boolean(dataId),
        hasSignature: Boolean(signature),
        hasSecret: Boolean(secret),
        hasAccessToken: Boolean(accessToken),
      }));
      return new Response("Missing webhook configuration", { status: 400 });
    }

    if (!await validSignature(signature, requestId, signedDataId, secret)) {
      const signatureFields = Object.fromEntries(
        signature.split(",").map((part) => {
          const separator = part.indexOf("=");
          return separator > 0
            ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()]
            : ["unknown", ""];
        }),
      );
      console.error("payment-webhook signature mismatch", JSON.stringify({
        hasQueryDataId: Boolean(signedDataId),
        hasBodyDataId: Boolean(body?.data?.id),
        hasRequestId: Boolean(requestId),
        hasTimestamp: Boolean(signatureFields.ts),
        hasV1: Boolean(signatureFields.v1),
        secretLength: secret.trim().length,
        liveMode: body?.live_mode,
        notificationType: body?.type,
        action: body?.action,
      }));
      return new Response("Invalid signature", { status: 401 });
    }

    const mpResponse = await fetch(
      "https://api.mercadopago.com/v1/orders/" + encodeURIComponent(dataId),
      { headers: { Authorization: "Bearer " + accessToken } },
    );
    if (!mpResponse.ok) {
      console.error("payment-webhook Mercado Pago lookup failed", JSON.stringify({
        status: mpResponse.status,
        dataId,
      }));
      return new Response("Unable to verify Mercado Pago order", { status: 502 });
    }

    const paymentOrder = await mpResponse.json();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // external_reference is the Celeris order UUID set during checkout.
    // Fall back to provider_order_id for older orders without that reference.
    let orderId = paymentOrder.external_reference
      ? String(paymentOrder.external_reference)
      : "";
    if (!orderId) {
      const lookup = await admin
        .from("store_orders")
        .select("id")
        .eq("provider_order_id", String(paymentOrder.id))
        .maybeSingle();
      if (lookup.error) throw lookup.error;
      orderId = lookup.data?.id || "";
    }
    if (!orderId) {
      console.error("payment-webhook no matching store order", JSON.stringify({
        providerOrderId: paymentOrder.id,
        hasExternalReference: Boolean(paymentOrder.external_reference),
      }));
      return new Response("Order not found", { status: 404 });
    }

    const total = Number(paymentOrder.total_amount || 0);
    const paid = Number(paymentOrder.total_paid_amount || 0);
    const isPaid = paymentOrder.status === "processed" && total > 0 && paid >= total;
    const isFailed = ["cancelled", "expired", "failed"].includes(String(paymentOrder.status));
    const payment = paymentOrder.transactions?.payments?.[0];

    const updates: Record<string, unknown> = {
      provider_order_id: paymentOrder.id,
      payment_status: isPaid ? "paid" : isFailed ? "failed" : "pending",
      payment_method:
        payment?.payment_method?.id ||
        payment?.payment_method?.type ||
        "mercado_pago",
      notes: "Mercado Pago: " + (paymentOrder.status || "unknown") +
        " / " + (paymentOrder.status_detail || "sem detalhe"),
    };
    if (isPaid) updates.status = "confirmed";

    const result = await admin
      .from("store_orders")
      .update(updates)
      .eq("id", orderId)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) {
      console.error("payment-webhook Celeris order update matched no row", JSON.stringify({
        orderId,
        providerOrderId: paymentOrder.id,
      }));
      return new Response("Celeris order not found", { status: 404 });
    }

    console.log("payment-webhook order synchronized", JSON.stringify({
      orderId,
      providerOrderId: paymentOrder.id,
      providerStatus: paymentOrder.status,
      paymentStatus: updates.payment_status,
    }));
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(
      "payment-webhook:",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response("Webhook processing failed", { status: 500 });
  }
});
