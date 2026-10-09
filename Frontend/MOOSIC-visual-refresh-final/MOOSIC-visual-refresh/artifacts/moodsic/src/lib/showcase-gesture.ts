export const SCROLL_THRESHOLD = 300;
export const SCROLL_COOLDOWN = 900;
export const GESTURE_IDLE = 220;
export type Gesture = { accumulated: number; last: number; lockedUntil: number; latched: boolean };
export const newGesture = (): Gesture => ({ accumulated: 0, last: -Infinity, lockedUntil: 0, latched: false });
// A committed gesture remains latched until BOTH momentum stops and cooldown expires.
export function accumulateScroll(state: Gesture, delta: number, now: number, index: number, count: number, threshold = SCROLL_THRESHOLD) {
  const idle = now - state.last > GESTURE_IDLE;
  const next = { ...state, last: now };
  if (idle) next.accumulated = 0;
  if (idle && now >= next.lockedUntil) next.latched = false;
  if (next.latched || now < next.lockedUntil) return { state: next, commit: 0, progress: 0, capture: true };
  if ((index === 0 && delta < 0 && next.accumulated <= 0) || (index === count - 1 && delta > 0 && next.accumulated >= 0)) {
    next.accumulated = 0;
    return { state: next, commit: 0, progress: 0, capture: false };
  }
  next.accumulated = Math.max(-threshold, Math.min(threshold, next.accumulated + delta));
  const progress = next.accumulated / threshold;
  const commit = Math.abs(progress) >= 1 ? Math.sign(progress) : 0;
  if (commit) { next.accumulated = 0; next.latched = true; next.lockedUntil = now + SCROLL_COOLDOWN; }
  return { state: next, commit, progress, capture: true };
}

export function swipeDirection(dx: number, dy: number): number {
  return Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.5 ? (dx < 0 ? 1 : -1) : 0;
}
