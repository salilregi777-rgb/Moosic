import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDemoCard } from './demo-payment.ts';
const now = new Date(2026, 9, 7);
const valid = { name: 'Demo User', card: '4242 4242 4242 4242', expiry: '10/26', cvv: '123' };
test('demo accepts the test card through its expiry month', () => {
  assert.deepEqual(validateDemoCard(valid, now), {});
  assert.deepEqual(validateDemoCard({ ...valid, expiry: '01/27' }, now), {});
});
test('demo rejects expired and malformed dates', () => {
  for (const expiry of ['09/26', '12/25', '00/27', '13/27', '1/27', '1027']) assert.ok(validateDemoCard({ ...valid, expiry }, now).expiry, expiry);
});
test('demo rejects malformed card numbers, bad checksums and non-test cards', () => {
  for (const card of ['', '42424242', '4242424242424241', '4000000000000002']) assert.ok(validateDemoCard({ ...valid, card }, now).card, card);
});
test('demo validates holder and CVV', () => {
  for (const cvv of ['', '12', '1234', 'abc']) assert.ok(validateDemoCard({ ...valid, cvv }, now).cvv);
  assert.ok(validateDemoCard({ ...valid, name: '123' }, now).name);
  assert.deepEqual(validateDemoCard({ ...valid, name: 'Ana María' }, now), {});
});
