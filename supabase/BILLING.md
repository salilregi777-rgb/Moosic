# Premium checkout

The API and website support a Razorpay payment for a 30-day Premium pass. The pass does not renew automatically. Checkout stays disabled until the owner connects the merchant account and explicitly sets a price. No real payment was made during development.

## Owner configuration

Complete Razorpay merchant onboarding in your own account. In the Supabase Edge Function secrets, set:

- `RAZORPAY_KEY_ID`: the merchant's live key ID.
- `RAZORPAY_KEY_SECRET`: its matching secret, server only.
- `RAZORPAY_WEBHOOK_SECRET`: a secret chosen for the webhook, server only.
- `BILLING_PRICE_INR`: the approved 30-day price in rupees, such as `299.00` only if that is the price you choose.
- `BILLING_ENABLED`: `true` only after configuration and payment verification have been checked.

Do not put these secrets in Vercel's `VITE_` variables or commit them. The API uses Supabase's built-in `SUPABASE_SERVICE_ROLE_KEY` only for billing RPCs; normal app requests continue to use the caller's JWT and RLS.

Configure this Razorpay webhook URL:

`https://meyuavzdjgyxunyxgqhu.supabase.co/functions/v1/api/premium/webhook`

Subscribe to `payment.captured`, `order.paid`, and `refund.processed`. Use the same webhook secret in both services and enable automatic capture in the Razorpay account. An authorized but uncaptured payment does not grant access. Refunds are initiated by the merchant in Razorpay; a verified refund revokes the affected pass. The implementation treats a partial refund as revocation too.

Use a separate staging Supabase project for provider test payments. The deployed configuration accepts only live-mode keys so simulated payments cannot unlock paid production memberships. Use the provider's documented test workflow and inspect webhook delivery before enabling real checkout. Offline tests verify the signature and ownership boundaries but do not replace a provider integration test.

## Deployment and verification

Apply `202610070001_verified_billing.sql`, then deploy the complete `api` directory, including `billing.ts`. The browser loads the merchant-controlled amount from `/premium/plans`, creates an authenticated server order, and opens Razorpay's hosted checkout. It never accepts card numbers or UPI PINs itself. A client callback alone cannot activate Premium: the server checks the signature, order owner, captured payment, amount, and currency before an atomic database function grants access.

Callbacks and signed webhooks use the same idempotent database function. Repeated delivery cannot extend a pass or duplicate revenue. Manual manager grants remain separate. Ending a manual grant does not remove already-paid time.

The browser reuses its checkout ID after a dropped response or dismissed payment window. Pending payment proof is kept in the current browser tab's session storage, scoped to the signed-in Auth user, so refreshes and navigation do not immediately offer a second payment. A failed verification shows **Retry payment verification** until the server resolves that payment; client storage never grants Premium.

Run `pnpm --dir supabase/tests test` for billing logic and PostgreSQL ownership, duplicate-event, refund, and expiry checks. Set `BILLING_ENABLED=false` to stop new checkouts while retaining payment verification and webhook handling for existing payments.
