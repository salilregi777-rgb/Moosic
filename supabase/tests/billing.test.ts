import assert from 'node:assert/strict';
import test from 'node:test';
import { billingPlans, createBilling, priceInPaise, validSignature, verifiedPayment } from '../functions/api/billing.ts';

const values = { BILLING_PRICE_INR: '299', BILLING_ENABLED: 'true', RAZORPAY_KEY_ID: 'rzp_live_testing', RAZORPAY_KEY_SECRET: 'server-test-secret', RAZORPAY_WEBHOOK_SECRET: 'webhook-test-secret', SUPABASE_SERVICE_ROLE_KEY: 'server-test-only' };
const env = (name: string) => values[name as keyof typeof values];
const order = { id: 'aa111111-1111-4111-8111-111111111111', user_id: 17, provider_order_id: 'order_example', amount_minor: 29900, currency: 'INR' };
const payment = { id: 'pay_example', order_id: order.provider_order_id, amount: 29900, currency: 'INR', status: 'captured', captured: true, amount_refunded: 0 };
async function sign(secret: string, message: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))).toString('hex');
}
function fixture() {
  const applied: unknown[] = [];
  const queries = { select: () => queries, eq: () => queries, maybeSingle: async () => ({ data: order, error: null }) };
  const admin = { from: () => queries, rpc: async (name: string, args: unknown) => { applied.push({ name, args }); return { data: { status: 'paid' }, error: null }; } };
  const db = { rpc: async () => ({ data: { is_premium: true, source: 'purchase' }, error: null }) };
  let requests = 0;
  const billing = createBilling({ env, admin: () => admin, fetch: async () => { requests++; return new Response(JSON.stringify(payment), { status: 200 }); } });
  return { billing, db, applied, requests: () => requests };
}

test('checkout requires an explicit valid price, live credentials and enable switch', () => {
  for (const value of [undefined, '', '-1', '0', '1e3', '2.999', '100001']) assert.equal(priceInPaise(value), null);
  assert.equal(priceInPaise('299.50'), 29950);
  assert.equal(billingPlans(() => undefined).enabled, false);
  assert.equal(billingPlans(name => name === 'RAZORPAY_KEY_ID' ? 'rzp_test_example' : env(name)).enabled, false);
  assert.equal(billingPlans(name => name === 'BILLING_ENABLED' ? 'false' : env(name)).enabled, false);
  assert.equal(billingPlans(env).enabled, true);
});
test('HMAC verifies exact message and rejects tampering or malformed signatures', async () => {
  const signature = await sign('secret', 'order_example|pay_example');
  assert(await validSignature('secret', 'order_example|pay_example', signature));
  assert.equal(await validSignature('secret', 'other|pay_example', signature), false);
  assert.equal(await validSignature('secret', 'order_example|pay_example', 'bad'), false);
});
test('payment must be captured with correct order, amount and currency', () => {
  assert.deepEqual(verifiedPayment(payment, order), { refunded: 0 });
  for (const patch of [{ order_id: 'order_other' }, { amount: 1 }, { currency: 'USD' }, { status: 'authorized', captured: false }, { amount_refunded: -1 }]) {
    assert.throws(() => verifiedPayment({ ...payment, ...patch }, order));
  }
  assert.deepEqual(verifiedPayment({ ...payment, status: 'refunded', amount_refunded: 29900 }, order), { refunded: 29900 });
});
test('another account cannot verify a valid order; forged callback cannot grant access', async () => {
  const f = fixture();
  const proof = { razorpay_order_id: order.provider_order_id, razorpay_payment_id: payment.id, razorpay_signature: await sign(values.RAZORPAY_KEY_SECRET, `${order.provider_order_id}|${payment.id}`) };
  await assert.rejects(f.billing.verify({ id: 99 }, proof, f.db), /not found for your account/);
  await assert.rejects(f.billing.verify({ id: 17 }, { ...proof, razorpay_signature: '0'.repeat(64) }, f.db), /verification failed/);
  assert.equal(f.requests(), 0); assert.equal(f.applied.length, 0);
  const result = await f.billing.verify({ id: 17 }, proof, f.db);
  assert.equal(result.is_premium, true); assert.equal(f.requests(), 1); assert.equal(f.applied.length, 1);
});
test('unsigned webhook cannot fetch a payment or call privileged billing RPC', async () => {
  const f = fixture();
  const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: payment } } });
  await assert.rejects(f.billing.webhook(new Request('https://example.test', { method: 'POST', body: raw })), /Invalid webhook signature/);
  assert.equal(f.requests(), 0); assert.equal(f.applied.length, 0);
  const signature = await sign(values.RAZORPAY_WEBHOOK_SECRET, raw);
  assert.deepEqual(await f.billing.webhook(new Request('https://example.test', { method: 'POST', body: raw, headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'event_example' } })), { received: true });
  assert.equal(f.applied.length, 1);
});
