import { useEffect, useRef, useState, type FormEvent } from 'react';
import { CreditCard, LockKeyhole, Sparkles, X } from 'lucide-react';
import { supabaseApiRequest } from '@/lib/supabase';
import { validateDemoCard, type DemoCardErrors, type DemoCardFields } from '@/lib/demo-payment';

const emptyFields = (): DemoCardFields => ({ name: '', card: '', expiry: '', cvv: '' });

export function PremiumCheckout({ onMembershipChange }: { onMembershipChange: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const alive = useRef(true);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState(emptyFields);
  const [errors, setErrors] = useState<DemoCardErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open) dialog.current?.close();
  }, [open]);

  const close = () => {
    if (submitting.current) return;
    setOpen(false); setFields(emptyFields()); setErrors({}); setMessage('');
  };
  const edit = (key: keyof DemoCardFields, value: string) => {
    setFields(previous => ({ ...previous, [key]: value }));
    setErrors(previous => ({ ...previous, [key]: undefined }));
    setMessage('');
  };
  const processPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = validateDemoCard(fields);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    submitting.current = true; setBusy(true); setMessage('Processing your demo payment…');
    try {
      // Simulation only: card fields never leave this component or enter storage.
      const result = await supabaseApiRequest('/premium/demo/activate', { method: 'POST', body: '{}' }) as { is_premium: boolean };
      if (!result.is_premium) throw new Error('Premium could not be activated. Please try again.');
      if (alive.current) { setFields(emptyFields()); setMessage('Demo payment successful. Premium is unlocked.'); }
      await onMembershipChange();
      if (alive.current) setOpen(false);
    } catch (error) {
      if (alive.current) setMessage(error instanceof Error ? error.message : 'The demo payment could not finish. Please retry.');
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const errorFor = (key: keyof DemoCardFields) => errors[key] ? <span className="demo-field-error" id={`demo-${key}-error`} role="alert">{errors[key]}</span> : null;

  return <div aria-label="Premium checkout">
    <div className="demo-checkout-note"><Sparkles size={16} aria-hidden="true" /> Demo checkout · No real charge</div>
    <p className="muted">Try every Premium feature with a simulated card payment. Cancel whenever you like.</p>
    <button className="solid-button" type="button" onClick={() => { setMessage(''); setOpen(true); }} data-testid="button-upgrade-premium"><CreditCard size={17} /> Unlock Premium</button>
    <dialog className="demo-payment-dialog" ref={dialog} aria-labelledby="demo-payment-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) close(); }}>
      <div className="demo-payment-content">
        <button type="button" className="demo-dialog-close" aria-label="Close demo checkout" onClick={close} disabled={busy}><X size={20} /></button>
        <div className="eyebrow">MOOSIC / DEMO PAYMENT</div>
        <h2 id="demo-payment-title">Your next level<br /><em>of listening.</em></h2>
        <p className="muted">This is a simulation. Nothing will be charged. Use the test card below, not your real card details.</p>
        <div className="demo-test-card"><CreditCard size={22} aria-hidden="true" /><div><strong>4242 4242 4242 4242</strong><span>Any current or future expiry · Test CVV: 123</span></div></div>
        <form onSubmit={processPayment} noValidate autoComplete="off">
          <label htmlFor="demo-name">Cardholder name</label>
          <input id="demo-name" autoFocus value={fields.name} onChange={event => edit('name', event.target.value)} maxLength={80} placeholder="Your name" disabled={busy} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'demo-name-error' : undefined} />
          {errorFor('name')}
          <label htmlFor="demo-card">Test card number</label>
          <input id="demo-card" value={fields.card} onChange={event => edit('card', event.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim())} inputMode="numeric" maxLength={19} placeholder="4242 4242 4242 4242" disabled={busy} aria-invalid={Boolean(errors.card)} aria-describedby={errors.card ? 'demo-card-error' : undefined} />
          {errorFor('card')}
          <div className="demo-card-row">
            <div><label htmlFor="demo-expiry">Expiry date</label><input id="demo-expiry" value={fields.expiry} onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 4); edit('expiry', digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits); }} inputMode="numeric" maxLength={5} placeholder="MM/YY" disabled={busy} aria-invalid={Boolean(errors.expiry)} aria-describedby={errors.expiry ? 'demo-expiry-error' : undefined} />{errorFor('expiry')}</div>
            <div><label htmlFor="demo-cvv">Test CVV</label><input id="demo-cvv" type="password" value={fields.cvv} onChange={event => edit('cvv', event.target.value.replace(/\D/g, '').slice(0, 3))} inputMode="numeric" maxLength={3} placeholder="123" disabled={busy} aria-invalid={Boolean(errors.cvv)} aria-describedby={errors.cvv ? 'demo-cvv-error' : undefined} />{errorFor('cvv')}</div>
          </div>
          <p className="demo-payment-privacy"><LockKeyhole size={13} aria-hidden="true" /> Test card details are never sent or saved.</p>
          <button className="solid-button demo-submit" type="submit" disabled={busy}>{busy ? 'Processing…' : 'Complete demo payment & unlock'}</button>
          <p role="status" aria-live="polite" className="demo-payment-message">{message}</p>
        </form>
      </div>
    </dialog>
  </div>;
}
