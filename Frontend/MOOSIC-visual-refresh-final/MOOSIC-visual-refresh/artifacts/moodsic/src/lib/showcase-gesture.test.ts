import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accumulateScroll, newGesture, swipeDirection } from './showcase-gesture.ts';
test('small movements scrub, reverse, and only commit at threshold', () => {
  let result = accumulateScroll(newGesture(), 90, 0, 1, 8);
  assert.equal(result.commit, 0); assert.equal(result.progress, .3);
  result = accumulateScroll(result.state, -60, 40, 1, 8);
  assert.equal(result.progress, .1);
  result = accumulateScroll(result.state, 270, 80, 1, 8);
  assert.equal(result.commit, 1);
});
test('long trackpad momentum cannot skip, even after cooldown', () => {
  let result = accumulateScroll(newGesture(), 300, 0, 0, 8);
  for (let time = 20; time < 2000; time += 20) {
    result = accumulateScroll(result.state, 60, time, 1, 8);
    assert.equal(result.commit, 0);
  }
  result = accumulateScroll(result.state, 300, 2400, 1, 8);
  assert.equal(result.commit, 1);
});
test('separate small gestures reset and boundary gestures release page', () => {
  const first = accumulateScroll(newGesture(), 180, 0, 1, 8);
  assert.equal(accumulateScroll(first.state, 180, 500, 1, 8).commit, 0);
  assert.equal(accumulateScroll(newGesture(), -50, 0, 0, 8).capture, false);
  assert.equal(accumulateScroll(newGesture(), 50, 0, 7, 8).capture, false);
  assert.equal(accumulateScroll(newGesture(), -300, 0, 7, 8).commit, -1);
});

test('touch requires a deliberate horizontal swipe and preserves vertical page scrolling', () => {
  assert.equal(swipeDirection(-120, 10), 1);
  assert.equal(swipeDirection(120, 10), -1);
  assert.equal(swipeDirection(30, 0), 0);
  assert.equal(swipeDirection(100, 160), 0);
});
