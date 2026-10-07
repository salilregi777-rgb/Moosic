// Razorpay credentials and the privileged client are confined to server code.
// Browser callbacks are evidence to verify, never authority to grant access.
type Row = Record<string, any>;
type Environment = (name: string) => string | undefined;
type Dependencies = {
  env: Environment;
  admin: () => any;
  fetch?: typeof fetch;
};

export class BillingError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const reject = (status: number, message: string): never => { throw new BillingError(status, message); };
const encoder = new TextEncoder();
const orderPattern = /^order_[A-Za-z0-9]{1,100}$/;
const paymentPattern = /^pay_[A-Za-z0-9]{1,100}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function priceInPaise(value: string | undefined): number | null {
  if (!value || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value)) return null;
  const [rupees, decimals = ''] = value.split('.');
  const amount = Number(rupees) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount >= 100 && amount <= 10000000 ? amount : null;
}

export function billingPlans(env: Environment) {
  const amount = priceInPaise(env('BILLING_PRICE_INR'));
  // A test-mode payment must never grant paid access on the public website.
  const providerReady = /^rzp_live_[A-Za-z0-9]+$/.test(env('RAZORPAY_KEY_ID') || '')
    && Boolean(env('RAZORPAY_KEY_SECRET')) && Boolean(env('RAZORPAY_WEBHOOK_SECRET'))
    && Boolean(env('SUPABASE_SERVICE_ROLE_KEY'));
  const configured = providerReady && amount !== null;
  const enabled = configured && env('BILLING_ENABLED') === 'true';
  return {
    configured, enabled, provider: 'razorpay',
    plan: { id: 'premium_30_days', name: 'Premium', amount_minor: amount, currency: 'INR', duration_days: 30, auto_renew: false },
    message: enabled
      ? 'One payment gives 30 days of Premium. Your pass does not renew automatically.'
      : 'Premium payments are being set up. Checkout will open once the payment account and price are configured.',
  };
}

export async function validSignature(secret: string, message: string, signature: unknown): Promise<boolean> {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, pair => Number.parseInt(pair, 16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, bytes, encoder.encode(message));
}

export function verifiedPayment(payment: Row, order: Row) {
  if (!payment || !paymentPattern.test(payment.id || '') || payment.order_id !== order.provider_order_id
      || payment.amount !== order.amount_minor || payment.currency !== order.currency) {
    reject(422, 'Payment details did not match this checkout. Your access was not changed.');
  }
  const refunded = payment.amount_refunded ?? 0;
  if (!Number.isSafeInteger(refunded) || refunded < 0 || refunded > order.amount_minor) {
    reject(502, 'The payment provider returned an invalid refund amount. Please try again.');
  }
  if (payment.status === 'refunded' && refunded > 0) return { refunded };
  if (payment.status !== 'captured' || payment.captured !== true) {
    reject(409, 'Your payment is still being confirmed. Please check your membership again shortly.');
  }
  return { refunded };
}

async function database(query: any): Promise<any> {
  const { data, error } = await query;
  if (error) {
    if (error.code === 'P0002') reject(404, 'Checkout was not found.');
    if (error.code === '42501') reject(403, 'This checkout does not belong to your account.');
    if (error.code === '22023') reject(409, 'This checkout cannot be completed. Refresh your membership before trying again.');
    if (error.code === 'P0001') reject(429, 'Too many checkout attempts. Please wait 15 minutes.');
    // Never disclose a provider secret, SQL detail, or customer record in errors.
    console.error('Billing database error', error.code);
    reject(503, 'Billing is temporarily unavailable. Please try again.');
  }
  return data;
}

export async function premiumStatus(db: any, env: Environment) {
  const status = await database(db.rpc('premium_status'));
  if (!status) reject(401, 'Sign in to see your membership.');
  return { ...status, checkout: billingPlans(env) };
}

export function createBilling(deps: Dependencies) {
  const env = deps.env;
  const request = deps.fetch || fetch;
  const credentials = () => {
    const keyId = env('RAZORPAY_KEY_ID'), secret = env('RAZORPAY_KEY_SECRET');
    if (!keyId || !/^rzp_live_[A-Za-z0-9]+$/.test(keyId) || !secret || !env('SUPABASE_SERVICE_ROLE_KEY')) {
      return reject(503, 'Secure payments are not configured yet. No payment has been started.');
    }
    return { keyId, secret };
  };
  const provider = async (path: string, options: RequestInit = {}): Promise<Row> => {
    const { keyId, secret } = credentials();
    let response: Response;
    try {
      response = await request(`https://api.razorpay.com/v1/${path}`, {
        ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Authorization': `Basic ${btoa(`${keyId}:${secret}`)}`, 'Content-Type': 'application/json' },
      });
    } catch { return reject(503, 'The payment provider could not be reached. Please try again.'); }
    if (!response.ok) return reject(502, 'The payment provider could not confirm this request. Please try again.');
    try { return await response.json(); }
    catch { return reject(502, 'The payment provider returned an invalid response. Please try again.'); }
  };
  const lookupOrder = (admin: any, orderId: string) => database(admin.from('billing_orders').select('*').eq('provider_order_id', orderId).maybeSingle());
  const applyPayment = async (admin: any, order: Row, payment: Row, eventId: string) => {
    const { refunded } = verifiedPayment(payment, order);
    return database(admin.rpc('billing_apply_payment', {
      razorpay_order_id: order.provider_order_id, razorpay_payment_id: payment.id,
      verified_amount: payment.amount, verified_currency: payment.currency,
      verified_refunded: refunded, provider_event: eventId,
    }));
  };
  const checkoutDetails = (order: Row, me: Row) => ({
    key_id: credentials().keyId, order_id: order.provider_order_id,
    amount: order.amount_minor, currency: order.currency, name: 'MOOSIC',
    description: 'Premium — 30 days, no automatic renewal',
    prefill: { name: me.name, email: me.email },
    checkout_id: order.id, duration_days: order.duration_days, auto_renew: false,
  });

  return {
    async checkout(me: Row, input: Row) {
      const plans = billingPlans(env);
      if (!plans.enabled) reject(503, plans.message);
      if (input.plan_id !== undefined && input.plan_id !== plans.plan.id) reject(422, 'Choose the 30-day Premium pass.');
      const checkoutId = input.checkout_id ?? crypto.randomUUID();
      if (typeof checkoutId !== 'string' || !uuidPattern.test(checkoutId)) reject(422, 'Invalid checkout reference.');
      const admin = deps.admin();
      const reserved = await database(admin.rpc('billing_reserve_order', {
        target_user_id: me.id, checkout_id: checkoutId, price_minor: plans.plan.amount_minor,
      }));
      if (!reserved.reserved) {
        if (reserved.status === 'created' && reserved.provider_order_id) return checkoutDetails(reserved, me);
        reject(409, reserved.status === 'paid'
          ? 'This checkout is already paid. Refresh your membership.'
          : 'This checkout is already being processed. Please start a new checkout shortly.');
      }
      try {
        const order = await provider('orders', { method: 'POST', body: JSON.stringify({
          amount: reserved.amount_minor, currency: reserved.currency, receipt: reserved.id,
          partial_payment: false, notes: { product: 'moosic_premium_30_days' },
        }) });
        if (!orderPattern.test(order.id || '') || order.amount !== reserved.amount_minor || order.currency !== reserved.currency) {
          reject(502, 'The payment provider returned an unexpected order. No checkout was opened.');
        }
        const saved = await database(admin.rpc('billing_attach_order', { checkout_id: reserved.id, razorpay_order_id: order.id }));
        return checkoutDetails(saved, me);
      } catch (error) {
        // If attaching succeeded but the response was interrupted, this call is
        // a no-op for 'created' orders; a retry with checkout_id reuses it.
        await admin.rpc('billing_fail_order', { checkout_id: reserved.id });
        throw error;
      }
    },

    async verify(me: Row, input: Row, db: any) {
      const { secret } = credentials();
      const orderId = input.razorpay_order_id, paymentId = input.razorpay_payment_id;
      if (typeof orderId !== 'string' || !orderPattern.test(orderId) || typeof paymentId !== 'string' || !paymentPattern.test(paymentId)) {
        reject(422, 'The checkout returned an invalid payment reference.');
      }
      const admin = deps.admin();
      const order = await lookupOrder(admin, orderId);
      // Do not leak whether another listener's order exists.
      if (!order || order.user_id !== me.id) reject(404, 'Checkout was not found for your account.');
      if (!await validSignature(secret, `${order.provider_order_id}|${paymentId}`, input.razorpay_signature)) {
        reject(422, 'Payment verification failed. Your access was not changed.');
      }
      const payment = await provider(`payments/${paymentId}`);
      if (payment.id !== paymentId) reject(502, 'The payment provider returned an unexpected payment.');
      const result = await applyPayment(admin, order, payment, `verify:${paymentId}:${payment.amount_refunded ?? 0}`);
      const status = await premiumStatus(db, env);
      return { ...status, payment_status: result.status === 'refunded' ? 'refunded' : 'success',
        message: result.status === 'refunded' ? 'This payment has been refunded.' : 'Payment confirmed. Your 30-day Premium pass is active.' };
    },

    async webhook(req: Request) {
      const secret = env('RAZORPAY_WEBHOOK_SECRET');
      if (!secret) reject(503, 'Billing webhooks are not configured.');
      const raw = await req.text();
      if (raw.length > 1048576) reject(413, 'Webhook is too large.');
      if (!await validSignature(secret!, raw, req.headers.get('x-razorpay-signature'))) reject(401, 'Invalid webhook signature.');
      let event: Row;
      try { event = JSON.parse(raw); } catch { return reject(400, 'Invalid webhook payload.'); }
      if (!event || !['payment.captured', 'order.paid', 'refund.processed'].includes(event.event)) return { received: true, ignored: true };
      const eventId = req.headers.get('x-razorpay-event-id');
      if (!eventId || !/^[A-Za-z0-9_-]{1,150}$/.test(eventId)) reject(400, 'A valid webhook event ID is required.');
      const paymentId = event.event === 'refund.processed'
        ? event.payload?.refund?.entity?.payment_id : event.payload?.payment?.entity?.id;
      if (typeof paymentId !== 'string' || !paymentPattern.test(paymentId)) reject(400, 'Webhook payment reference is missing.');
      // Fetch current provider state: a late capture event cannot resurrect a
      // refunded pass, and callback tampering cannot manufacture a capture.
      const payment = await provider(`payments/${paymentId}`);
      if (payment.id !== paymentId || !orderPattern.test(payment.order_id || '')) reject(502, 'Unable to confirm webhook payment.');
      const admin = deps.admin();
      const order = await lookupOrder(admin, payment.order_id);
      if (!order) return { received: true, ignored: true };
      if (event.event === 'refund.processed' && !(payment.amount_refunded > 0)) reject(503, 'Refund confirmation is pending. Retry this event.');
      await applyPayment(admin, order, payment, `webhook:${eventId}`);
      return { received: true };
    },
  };
}
