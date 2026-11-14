# Mercado Pago Checkout

## Secrets no Supabase > Edge Functions > Secrets
- `MERCADOPAGO_ACCESS_TOKEN`: Access Token privado (comece pelo token de teste).
- `MERCADOPAGO_WEBHOOK_SECRET`: assinatura secreta gerada na configuração de Webhooks.
Nunca coloque essas chaves no frontend, Cloudflare Pages ou arquivos versionados.

## Deploy
```bash
supabase functions deploy create-checkout
supabase functions deploy payment-webhook
```
Webhook: `https://frimiolhtpvmxmrsxnei.supabase.co/functions/v1/payment-webhook`. Selecione o evento **Order (Mercado Pago)**.

O checkout coleta endereço, mas ainda não calcula frete. O total cobrado é apenas o subtotal dos produtos; o frete será combinado separadamente. Defina uma política de frete antes de aceitar pedidos com entrega.