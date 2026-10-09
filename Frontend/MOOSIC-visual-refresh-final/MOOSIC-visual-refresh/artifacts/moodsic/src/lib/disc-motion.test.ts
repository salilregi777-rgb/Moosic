import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceSpring, advanceDiscHovers, createDiscHover, discLayout, circularOffset, settled } from './disc-motion.ts';

test('disc easing takes the same path on 60Hz and 120Hz screens', () => {
  const simulate = (fps: number) => { let state = { value: 0, velocity: 0 }; for (let i = 0; i < fps; i++) state = advanceSpring(state, 1, 1 / fps); return state; };
  assert.ok(Math.abs(simulate(60).value - simulate(120).value) < .000001);
  assert.ok(settled(simulate(60), 1));
});
test('rapid reversals and a suspended tab stay finite and settle', () => {
  let state = { value: 0, velocity: 0 };
  for (let i = 0; i < 50; i++) state = advanceSpring(state, i % 2 ? -100 : 100, i === 25 ? 3600 : 1 / 60);
  for (let i = 0; i < 240; i++) state = advanceSpring(state, 0, 1 / 60);
  assert.ok(Number.isFinite(state.value)); assert.ok(settled(state, 0));
});
test('disc collection wraps in both directions without travelling through the whole catalog', () => {
  assert.equal(circularOffset(4, 5), -1);
  assert.equal(circularOffset(-4, 5), 1);
  assert.equal(circularOffset(15, 5), 0);
  assert.equal(circularOffset(-1.25, 5), -1.25);
});

test('only the hovered disc reacts and the previous disc returns to rest', () => {
  const idle = Array.from({ length: 5 }, createDiscHover);
  let states = advanceDiscHovers(idle, 2, .8, -.5, 1 / 60);
  assert.equal(states[0], idle[0]);
  assert.equal(states[4], idle[4]);
  assert.ok(states[2].x.value > 0);
  for (let frame = 0; frame < 150; frame++) states = advanceDiscHovers(states, 3, .4, .2, 1 / 60);
  assert.equal(states[2].x.value, 0);
  assert.equal(states[2].light.value, 0);
  assert.ok(states[3].x.value > .39);
  const reduced = advanceDiscHovers(states, 3, 1, 1, 1 / 60, true);
  assert.ok(reduced.every(state => state.x.value === 0 && state.y.value === 0 && state.light.value === 0));
});

test('one disc is visible at rest, neighbors enter during scrolling and recycle invisibly', () => {
  for (let selected = 0; selected < 5; selected++) {
    const discs = Array.from({ length: 5 }, (_, index) => discLayout(index, selected, 5, 600));
    assert.deepEqual(discs.filter(disc => disc.visible).map(disc => disc.offset), [0]);
  }
  assert.ok(discLayout(1, .5, 5, 600).visible);
  assert.ok(discLayout(0, .5, 5, 600).visible);
  assert.equal(discLayout(0, 2.5, 5, 600).opacity, 0);
  assert.equal(discLayout(4, -1, 5, 600).x, 0);
});
