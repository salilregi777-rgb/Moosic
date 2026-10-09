export const DEMO_CARD = '4242424242424242';
export type DemoCardFields = { name: string; card: string; expiry: string; cvv: string };
export type DemoCardErrors = Partial<Record<keyof DemoCardFields, string>>;

export function validateDemoCard(fields: DemoCardFields, now = new Date()): DemoCardErrors {
  const errors: DemoCardErrors = {};
  if (fields.name.trim().length < 2 || !/^[\p{L}\p{M} .'-]+$/u.test(fields.name.trim())) errors.name = 'Enter the cardholder’s name.';
  const digits = fields.card.replace(/\s/g, '');
  if (!/^\d{16}$/.test(digits)) errors.card = 'Enter a 16-digit test card number.';
  else {
    const sum = [...digits].reverse().reduce((total, value, index) => {
      let digit = Number(value);
      if (index % 2) { digit *= 2; if (digit > 9) digit -= 9; }
      return total + digit;
    }, 0);
    if (sum % 10) errors.card = 'The card number is invalid. Check the digits.';
    else if (digits !== DEMO_CARD) errors.card = 'Use the demo card 4242 4242 4242 4242. Real cards are not accepted.';
  }
  const expiry = /^(\d{2})\s*\/\s*(\d{2})$/.exec(fields.expiry.trim());
  if (!expiry) errors.expiry = 'Enter an expiry date as MM/YY.';
  else {
    const month = Number(expiry[1]);
    const year = 2000 + Number(expiry[2]);
    if (month < 1 || month > 12) errors.expiry = 'Enter a month between 01 and 12.';
    else if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) errors.expiry = 'This card has expired. Use a current or future expiry date.';
  }
  if (!/^\d{3}$/.test(fields.cvv)) errors.cvv = 'Enter a 3-digit test CVV.';
  return errors;
}
