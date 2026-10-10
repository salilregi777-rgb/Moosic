import { useEffect, useRef, type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import { contourPath, stepSpring } from './cd-motion';
import './cd-interactions.css';

/** Hover owns only these two layers. Gallery positioning and playlist scrolling stay outside. */
export function InteractiveCD({ children, frozen = false }: { children: ReactNode; frozen?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const element = root.current;
    if (!element || frozen) return;
    const surface = element.querySelector<HTMLElement>('.cd-hover-surface')!;
    const outline = element.querySelector<SVGSVGElement>('.cd-sketch')!;
    const path = outline.querySelector('path')!;
    const button = element.closest('button')!;
    let frame = 0, last = 0, clock = 0, hovered = false, focused = false;
    let box: DOMRect | undefined;
    let targetX = 0, targetY = 0;
    let x = { value: 0, velocity: 0 }, y = { ...x }, lift = { ...x }, trailX = { ...x }, trailY = { ...x };
    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
      last = now; clock += dt;
      const active = hovered || focused;
      lift = stepSpring(lift, active ? 1 : 0, dt, 70, 12);
      // Slow sub-degree rocking continues when the cursor stops, never a full spin.
      x = stepSpring(x, active ? targetX + Math.sin(clock * 1.8) * .7 : 0, dt);
      y = stepSpring(y, active ? targetY + Math.sin(clock * 1.4 + .5) * .55 : 0, dt);
      trailX = stepSpring(trailX, x.value, dt, 45, 11);
      trailY = stepSpring(trailY, y.value, dt, 45, 11);
      surface.style.transform = `translate3d(${x.value * .28}px,${-lift.value * 5}px,0) rotateX(${y.value}deg) rotateY(${x.value}deg) rotateZ(${x.value * .21}deg)`;
      element.style.setProperty('--cd-light-x', `${x.value * 4}px`);
      element.style.setProperty('--cd-light-angle', `${y.value * 2}deg`);
      outline.style.transform = `translate3d(${trailX.value * .55}px,${-lift.value * 3 + trailY.value * .25}px,10px) rotateX(${trailY.value * .65}deg) rotateY(${trailX.value * .7}deg) rotateZ(${trailX.value * .15}deg)`;
      path.setAttribute('d', contourPath(clock, Math.max(0, lift.value)));
      const settled = !active && [x, y, lift, trailX, trailY].every(p => Math.abs(p.value) < .015 && Math.abs(p.velocity) < .025);
      if (!settled) frame = requestAnimationFrame(tick);
      else { frame = 0; last = 0; surface.style.transform = ''; outline.style.transform = ''; }
    };
    const start = () => { if (!reduced && !frame) frame = requestAnimationFrame(tick); };
    const state = () => { element.dataset.active = String(hovered || focused); start(); };
    const point = (event: PointerEvent) => {
      if (!box || event.pointerType === 'touch') return;
      targetX = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1)) * 9;
      targetY = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1)) * -7;
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      box = button.getBoundingClientRect(); hovered = true; point(event); state();
    };
    const leave = () => { hovered = false; targetX = targetY = 0; state(); };
    const focus = () => { focused = button.matches(':focus-visible'); state(); };
    const blur = () => { focused = false; state(); };
    const resize = () => { if (hovered) box = button.getBoundingClientRect(); };
    button.addEventListener('pointerenter', enter);
    button.addEventListener('pointermove', point);
    button.addEventListener('pointerleave', leave);
    button.addEventListener('focus', focus);
    button.addEventListener('blur', blur);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      button.removeEventListener('pointerenter', enter); button.removeEventListener('pointermove', point);
      button.removeEventListener('pointerleave', leave); button.removeEventListener('focus', focus); button.removeEventListener('blur', blur);
      window.removeEventListener('resize', resize);
    };
  }, [frozen, reduced]);
  return <div ref={root} className="cd-interaction" data-cd-visual data-active="false">
    <svg className="cd-sketch" viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d={contourPath(0, 0)} /></svg>
    <div className="cd-hover-surface">{children}</div>
  </div>;
}
