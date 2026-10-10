import assert from 'node:assert/strict';
import test from 'node:test';
import { contourPath, stepSpring } from '../components/cd/cd-motion.ts';

test('hover spring preserves velocity and settles after an interrupted gesture', () => {
  let point = { value: 0, velocity: 0 };
  for (let i = 0; i < 20; i++) point = stepSpring(point, 9, 1 / 60);
  const moving = point;
  point = stepSpring(point, -9, 1 / 60);
  assert.ok(Math.abs(point.value - moving.value) < 1, 'changing direction does not snap to a new angle');
  for (let i = 0; i < 240; i++) point = stepSpring(point, 0, 1 / 60);
  assert.ok(Math.abs(point.value) < .001);
  assert.ok(Math.abs(point.velocity) < .001);
});
test('spring remains bounded across a suspended browser frame', () => {
  let point = { value: 7, velocity: 30 };
  for (let i = 0; i < 100; i++) point = stepSpring(point, 0, 60);
  assert.ok(Number.isFinite(point.value));
  assert.ok(Math.abs(point.value) < .01);
});
test('sketch has a stable smooth contour, with only subtle animated deviations', () => {
  const idle = contourPath(0, 0), active = contourPath(2, 1);
  assert.notEqual(idle, active);
  assert.equal((active.match(/ C /g) ?? []).length, 32);
  const values = active.match(/-?\d+\.\d+/g)!.map(Number);
  assert.ok(values.every(value => value >= 0 && value <= 100));
  assert.deepEqual(values.slice(-2), values.slice(0, 2), 'the contour closes without a sharp seam');
});
