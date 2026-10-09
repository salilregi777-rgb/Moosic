import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrollTrackProgress, splitEditorialTitle, NEXT_MOOD_COMMIT } from './next-mood-motion.ts';
test('scroll position holds midway indefinitely and reverses without a timer', () => {
  const at = (y: number) => scrollTrackProgress(y, 2000, 2400, 800);
  assert.equal(at(1000), 0);
  assert.equal(at(2800), .5);
  for (let stopped = 0; stopped < 100; stopped++) assert.equal(at(2800), .5);
  assert.equal(at(2400), .25);
  assert.equal(at(2200), .125);
  assert.ok(at(3590) < NEXT_MOOD_COMMIT);
  assert.ok(at(3600) >= NEXT_MOOD_COMMIT);
});
test('destination typography splits into two editorial bands', () => {
  assert.deepEqual(splitEditorialTitle('After the rain'), ['After the', 'rain']);
  assert.deepEqual(splitEditorialTitle('Low battery'), ['Low', 'battery']);
});
