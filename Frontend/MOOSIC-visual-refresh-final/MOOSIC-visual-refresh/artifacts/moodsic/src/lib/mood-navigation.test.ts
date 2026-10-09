import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOOD_ORDER, moodFromSlug, adjacentMood, durationMinutes, durationLabel } from './mood-navigation.ts';
test('each mood has a direct route and the sequence never wraps unexpectedly', () => {
  for (const mood of MOOD_ORDER) assert.equal(moodFromSlug(mood.toLowerCase()), mood);
  assert.equal(moodFromSlug('missing'), undefined);
  assert.equal(adjacentMood('Happy', -1), undefined);
  assert.equal(adjacentMood('Happy', 1), 'Sad');
  assert.equal(adjacentMood('Exhausted', 1), undefined);
});
test('duration totals come from track metadata, including missing duration', () => {
  assert.equal(durationMinutes([{ duration: '3:30' }, { duration: '4:30' }]), 8);
  assert.equal(durationMinutes([{ duration: 'unknown' }]), 0);
});

test('incomplete duration metadata is shown as a lower bound, not a fabricated total', () => {
 assert.equal(durationLabel([{duration:'4:00'}, {duration:'--:--'}]), '4+ min');
 assert.equal(durationLabel([{duration:'--:--'}]), 'Duration unavailable');
});
