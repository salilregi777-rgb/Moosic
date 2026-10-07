import { useEffect, useRef, useState } from 'react';
import { CreditCard, RefreshCw } from 'lucide-react';
import { requireSupabase, supabaseApiRequest } from '@/lib/supabase';

type Plans = {
  configured: boolean;
  enabled: boolean;
  provider: 'razorpay';
  message?: string;
  plan: { id: string; name: string; amount_minor: number | null; currency: string; duration_days: number; auto_renew: false };
};
type Order = { key_id: string; order_id: string; amount: number; currency: string; name: string; description: string; prefill?: { name?: string; email?: string } };
type PaymentProof = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type PurchaseAttempt = { checkoutId: string; orderId?: string; proof?: PaymentProof };
type Verification = { is_premium: boolean; payment_status?: 'success' | 'refunded'; message?: string };
type Checkout = { open(): void; close(): void; on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void };
type RazorpayConstructor = new (options: Record<string, unknown>) => Checkout;
declare global { interface Window { Razorpay?: RazorpayConstructor } }

const attemptsInMemory = new Map<string, PurchaseAttempt>();
const attemptKey = (userId: string) => `moosic-premium-checkout:${userId}`;
function savedAttempt(userId: string): PurchaseAttempt | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(attemptKey(userId)) || 'null');
    if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.checkoutId)
      && (!value.orderId || /^order_[A-Za-z0-9]{1,100}$/.test(value.orderId))
      && (!value.proof || (/^order_[A-Za-z0-9]{1,100}$/.test(value.proof.razorpay_order_id)
        && /^pay_[A-Za-z0-9]{1,100}$/.test(value.proof.razorpay_payment_id)
        && /^[0-9a-f]{64}$/i.test(value.proof.razorpay_signature)))) return value;
  } catch { /* In-memory recovery also works when session storage is unavailable. */ }
  return attemptsInMemory.get(userId) ?? null;
}
function rememberAttempt(userId: string, attempt: PurchaseAttempt | null) {
  if (attempt) attemptsInMemory.set(userId, attempt);
  else attemptsInMemory.delete(userId);
  try {
    if (attempt) window.sessionStorage.setItem(attemptKey(userId), JSON.stringify(attempt));
    else window.sessionStorage.removeItem(attemptKey(userId));
  } catch { /* Payment proof is still retained in this tab's memory. */ }
}

let loadingCheckout: Promise<RazorpayConstructor> | undefined;
async function loadCheckout() {
  if (window.Razorpay) return window.Razorpay;
  if (!loadingCheckout) loadingCheckout = new Promise<RazorpayConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      loadingCheckout = undefined;
      reject(new Error('The payment window could not load. Check your connection and try again.'));
    };
    const timer = window.setTimeout(fail, 20000);
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Razorpay) resolve(window.Razorpay);
      else fail();
    };
    document.head.appendChild(script);
  });
  return loadingCheckout;
}

export function PremiumCheckout({ onMembershipChange }: { onMembershipChange: () => Promise<void> }) {
  const [plans, setPlans] = useState<Plans | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<PurchaseAttempt | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const ownerRef = useRef<string | null>(null);
  const attemptRef = useRef<PurchaseAttempt | null>(null);
  const checkoutRef = useRef<Checkout | null>(null);

  const retainAttempt = (owner: string, value: PurchaseAttempt | null) => {
    rememberAttempt(owner, value);
    if (ownerRef.current === owner) {
      attemptRef.current = value;
      if (alive.current) setAttempt(value);
    }
  };
  const settle = () => {
    pending.current = false;
    if (alive.current) { setBusy(false); setVerifying(false); }
  };

  const refreshPlans = async () => {
    try {
      const result = await supabaseApiRequest('/premium/plans', {}, false) as Plans;
      if (alive.current) setPlans(result);
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : 'Could not load checkout. Please retry.');
    }
  };

  useEffect(() => {
    let mounted = true;
    alive.current = true;
    void refreshPlans();
    void requireSupabase().auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;
      if (error || !session) { setMessage('Sign in again to continue with secure checkout.'); return; }
      const owner = session.user.id;
      ownerRef.current = owner;
      setUserId(owner);
      const previous = savedAttempt(owner);
      attemptRef.current = previous;
      setAttempt(previous);
      if (previous?.proof) setMessage(`A payment is awaiting confirmation. Retry verification before paying again. Reference: ${previous.proof.razorpay_payment_id}.`);
    }).catch(() => { if (mounted) setMessage('Your account could not be checked. Sign in again before paying.'); });
    return () => { mounted = false; alive.current = false; checkoutRef.current?.close(); };
  }, []);

  const verifyAttempt = async (owner: string, current: PurchaseAttempt) => {
    if (!current.proof) return;
    pending.current = true;
    if (alive.current) { setBusy(true); setVerifying(true); setMessage('Confirming payment with the server…'); }
    try {
      const { data: { session }, error } = await requireSupabase().auth.getSession();
      if (error || session?.user.id !== owner) throw new Error('Sign in to the account that started this payment to verify it.');
      if (!alive.current) return;
      const result = await supabaseApiRequest('/premium/verify', { method: 'POST', body: JSON.stringify(current.proof) }) as Verification;
      if (result.payment_status === 'success' || result.payment_status === 'refunded') {
        // Only the verified server result resolves this attempt. UI state never
        // grants Premium; the parent refreshes the server-owned membership.
        retainAttempt(owner, null);
        if (alive.current) setConfirmed(result.payment_status === 'success');
      }
      await onMembershipChange();
      if (alive.current) setMessage(result.is_premium ? 'Payment confirmed. Premium is active.' : result.message ?? 'Payment is processing. Retry verification shortly.');
    } catch (error) {
      if (alive.current) setMessage(`Your payment needs confirmation. Retry verification before paying again. Reference: ${current.proof.razorpay_payment_id}. ${error instanceof Error ? error.message : ''}`);
    } finally { settle(); }
  };

  const retryVerification = () => {
    if (pending.current || !userId || !attemptRef.current?.proof) return;
    void verifyAttempt(userId, attemptRef.current);
  };

  const releaseFailedAttempt = async (owner: string, checkoutId: string) => {
    // A definite server-side failure permits a fresh attempt. Network errors
    // and still-processing orders keep the original idempotency key.
    try {
      const { data, error } = await requireSupabase().from('billing_orders').select('status').eq('id', checkoutId).maybeSingle();
      if (!error && data?.status === 'failed' && ownerRef.current === owner
          && attemptRef.current?.checkoutId === checkoutId && !attemptRef.current.proof) retainAttempt(owner, null);
    } catch { /* Keep the recoverable checkout when its status is unknown. */ }
  };

  const purchase = async () => {
    if (pending.current || confirmed || !userId || attemptRef.current?.proof || !plans?.enabled || !plans.configured) return;
    const owner = userId;
    const current = attemptRef.current ?? { checkoutId: crypto.randomUUID() };
    retainAttempt(owner, current);
    pending.current = true;
    setBusy(true);
    setMessage('Opening secure checkout…');
    let receivedPayment = false;
    try {
      const { data: { session }, error } = await requireSupabase().auth.getSession();
      if (error || session?.user.id !== owner) throw new Error('Sign in again before starting checkout.');
      const Razorpay = await loadCheckout();
      if (!alive.current) { settle(); return; }
      const order = await supabaseApiRequest('/premium/checkout', { method: 'POST', body: JSON.stringify({ plan_id: plans.plan.id, checkout_id: current.checkoutId }) }) as Order;
      current.orderId = order.order_id;
      retainAttempt(owner, current);
      if (!alive.current) { settle(); return; }
      const checkout = new Razorpay({
        key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency,
        name: order.name, description: order.description, prefill: order.prefill,
        theme: { color: '#5e08aa' },
        modal: { ondismiss: () => {
          if (receivedPayment) return;
          settle();
          if (alive.current) setMessage('Checkout closed. You can reopen this same checkout. If your bank shows a pending payment, refresh membership before trying again.');
        } },
        handler: async (proof: PaymentProof) => {
          if (receivedPayment) return;
          receivedPayment = true;
          const paidAttempt = { ...current, proof };
          retainAttempt(owner, paidAttempt);
          await verifyAttempt(owner, paidAttempt);
        },
      });
      checkout.on('payment.failed', (response) => {
        if (!receivedPayment && alive.current) setMessage(response.error?.description ?? 'Payment was not completed. You can retry in the secure checkout window.');
      });
      checkoutRef.current = checkout;
      checkout.open();
      setMessage('Complete payment in the secure Razorpay window.');
    } catch (error) {
      settle();
      if (alive.current) setMessage(error instanceof Error ? error.message : 'Unable to start checkout. Please retry.');
      void releaseFailedAttempt(owner, current.checkoutId);
    }
  };

  const amount = plans?.plan.amount_minor;
  const price = typeof amount === 'number' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: plans!.plan.currency }).format(amount / 100) : null;
  return (
    <div aria-label="Premium checkout">
      {attempt?.proof ? (
        <>
          <p className="muted">Your payment is awaiting server confirmation. Verify this payment before starting another checkout.</p>
          <button className="solid-button" type="button" disabled={busy || !userId} onClick={retryVerification} data-testid="button-retry-payment-verification">
            <RefreshCw size={17} /> {verifying ? 'Confirming payment…' : 'Retry payment verification'}
          </button>
        </>
      ) : confirmed ? (
        <p className="muted">This payment has been confirmed. Refresh membership to see your current access.</p>
      ) : plans?.enabled && plans.configured && price ? (
        <>
          <p style={{ margin: '0 0 8px', fontSize: 22 }}><strong>{price}</strong> for {plans.plan.duration_days} days</p>
          <p className="muted" style={{ margin: '0 0 18px' }}>One payment. No automatic renewal. Choose an available payment method in Razorpay checkout.</p>
          <button className="solid-button" type="button" disabled={busy || !userId} onClick={() => void purchase()} data-testid="button-upgrade-premium">
            <CreditCard size={17} /> {busy ? verifying ? 'Confirming payment…' : 'Checkout open…' : `Pay ${price} and unlock Premium`}
          </button>
        </>
      ) : (
        <p className="muted" style={{ margin: '0 0 14px' }}>{plans?.message ?? (message ? 'Checkout could not be loaded.' : 'Loading payment options…')}</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        <button type="button" className="outline-button small-button" disabled={busy} onClick={() => void onMembershipChange()}><RefreshCw size={14} /> Refresh membership</button>
        {!plans?.enabled && <button type="button" className="outline-button small-button" onClick={() => void refreshPlans()}>Reload payment options</button>}
      </div>
      <p role="status" aria-live="polite" style={{ fontSize: 14, lineHeight: 1.5, marginTop: 14 }}>{message}</p>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>Premium activates after the server confirms payment. MOOSIC does not collect or store card numbers, CVVs, or UPI PINs.</p>
    </div>
  );
}
