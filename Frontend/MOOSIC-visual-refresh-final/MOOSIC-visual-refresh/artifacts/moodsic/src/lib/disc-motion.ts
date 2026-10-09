export type Spring = { value: number; velocity: number };
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function circularOffset(value: number, count: number): number {
  return ((value + count / 2) % count + count) % count - count / 2;
}
// Analytic critically damped spring: consistent easing on 60Hz and 120Hz displays.
export function advanceSpring(state: Spring, target: number, seconds: number, frequency = 11): Spring {
  const dt = clamp(seconds, 0, .1);
  const offset = state.value - target;
  const impulse = state.velocity + frequency * offset;
  const decay = Math.exp(-frequency * dt);
  return { value: target + (offset + impulse * dt) * decay, velocity: (state.velocity - frequency * impulse * dt) * decay };
}
export const settled = (state: Spring, target: number) => Math.abs(state.value - target) < .0005 && Math.abs(state.velocity) < .005;

export type DiscHover = { x: Spring; y: Spring; light: Spring };
export const createDiscHover = (): DiscHover => ({ x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, light: { value: 0, velocity: 0 } });

// Keep settled discs untouched. Only the pointer's disc and a previously
// hovered disc returning to rest need their transforms or highlights updated.
export function advanceDiscHovers(states: DiscHover[], hovered: number, x: number, y: number, dt: number, reduced = false): DiscHover[] {
  return states.map((state, index) => {
    const selected = !reduced && index === hovered;
    const tx = selected ? clamp(x, -1, 1) : 0;
    const ty = selected ? clamp(y, -1, 1) : 0;
    const light = selected ? 1 : 0;
    if (settled(state.x, tx) && settled(state.y, ty) && settled(state.light, light)) {
      if (state.x.value === tx && state.y.value === ty && state.light.value === light && !state.x.velocity && !state.y.velocity && !state.light.velocity) return state;
      return { x: { value: tx, velocity: 0 }, y: { value: ty, velocity: 0 }, light: { value: light, velocity: 0 } };
    }
    if (reduced) return createDiscHover();
    return { x: advanceSpring(state.x, tx, dt, 14), y: advanceSpring(state.y, ty, dt, 14), light: advanceSpring(state.light, light, dt, 11) };
  });
}

export function discLayout(index: number, position: number, count: number, spacing: number, velocity = 0) {
  const offset = circularOffset(index - position, count);
  const distance = Math.abs(offset);
  // Neighbors live outside the aperture at rest and enter as it scrolls.
  // Recycling occurs entirely beyond this fade, so wrapped discs never jump.
  const fade = clamp((distance - .68) / .32, 0, 1);
  const opacity = 1 - fade * fade * (3 - 2 * fade);
  return {
    offset, distance, x: offset * spacing, y: offset * -24,
    z: distance * -80, angle: -14 - offset * 6 + clamp(velocity * -.7, -7, 7),
    scale: 1 - distance * .035, opacity, visible: opacity > .001,
  };
}
