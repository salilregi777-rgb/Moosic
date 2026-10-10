export type SpringPoint = { value: number; velocity: number };
export function stepSpring(point: SpringPoint, target: number, dt: number, stiffness = 85, damping = 13): SpringPoint {
  // Cap long frames (background tabs) and subdivide to keep the spring stable.
  const elapsed = Math.min(Math.max(dt, 0), .05);
  const steps = Math.max(1, Math.ceil(elapsed / .008));
  let { value, velocity } = point;
  for (let i = 0; i < steps; i++) {
    velocity += ((target - value) * stiffness - velocity * damping) * elapsed / steps;
    value += velocity * elapsed / steps;
  }
  return { value, velocity };
}
export function contourPath(time: number, strength: number): string {
  const count = 32;
  const points = Array.from({ length: count }, (_, i) => {
    const angle = i / count * Math.PI * 2 - Math.PI / 2;
    const radius = 48 + Math.sin(angle * 3 + .6) * .65 + Math.sin(angle * 5 - .8) * .35
      + strength * (Math.sin(angle * 3 - time * 1.1) * .65 + Math.cos(angle * 2 + time * .7) * .45);
    return [50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius];
  });
  // Smooth periodic Catmull–Rom contour; deliberately not a perfect SVG circle.
  let path = `M ${points[0][0].toFixed(3)} ${points[0][1].toFixed(3)}`;
  for (let i = 0; i < count; i++) {
    const a = points[(i + count - 1) % count], b = points[i], c = points[(i + 1) % count], d = points[(i + 2) % count];
    path += ` C ${(b[0] + (c[0] - a[0]) / 6).toFixed(3)} ${(b[1] + (c[1] - a[1]) / 6).toFixed(3)} ${(c[0] - (d[0] - b[0]) / 6).toFixed(3)} ${(c[1] - (d[1] - b[1]) / 6).toFixed(3)} ${c[0].toFixed(3)} ${c[1].toFixed(3)}`;
  }
  return path;
}
