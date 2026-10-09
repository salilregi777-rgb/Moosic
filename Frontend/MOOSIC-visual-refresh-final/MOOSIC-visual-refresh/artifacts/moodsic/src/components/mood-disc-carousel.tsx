import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Rotate3D } from 'lucide-react';
import { advanceSpring, advanceDiscHovers, createDiscHover, discLayout, circularOffset, clamp, settled, type Spring } from '@/lib/disc-motion';

type Disc = { name: string; art: string; color: string; subtitle: string };
type Props = { discs: Disc[]; active: number; onPreview: (index: number) => void; onSelect: (index: number) => void };
const spring = (value = 0): Spring => ({ value, velocity: 0 });

export function MoodDiscCarousel({ discs, active, onPreview, onSelect }: Props) {
  const gallery = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);
  const initialActive = useRef(active);
  const [flipped, setFlipped] = useState(false);
  const model = useRef({ position: spring(active), hovers: discs.map(createDiscHover), hovered: -1, spacing: 600, flip: spring(), flipIndex: active, target: active, previous: active, tx: 0, ty: 0, tl: 0, tf: 0, drag: 0, reduced: false });
  const gesture = useRef({ id: -1, x: 0, y: 0, dx: 0, dragging: false, vertical: false, suppressUntil: 0 });
  const callbacks = useRef({ onPreview, onSelect, active });
  callbacks.current = { onPreview, onSelect, active };
  const aimBounds = useRef({ index: -1, left: 0, top: 0, width: 1, height: 1 });
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const root = gallery.current;
    if (!root) return;
    const state = model.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let previousTime = 0;
    let disposed = false;
    let previousPosition = NaN;
    let previousFlip = NaN;
    let previousHovers = state.hovers;
    let layoutDirty = true;
    const paint = () => {
      const layoutChanged = layoutDirty || previousPosition !== state.position.value;
      const flipChanged = previousFlip !== state.flip.value;
      nodes.current.forEach((node, index) => {
        if (!node) return;
        const style = node.style;
        if (layoutChanged) {
          const layout = discLayout(index, state.position.value, discs.length, state.spacing, state.position.velocity);
          style.setProperty('--disc-x', `${layout.x}px`);
          style.setProperty('--disc-y', `${layout.y}px`);
          style.setProperty('--disc-z', `${layout.z}px`);
          style.setProperty('--disc-angle', `${layout.angle}deg`);
          style.setProperty('--disc-scale', `${layout.scale}`);
          style.opacity = String(layout.opacity);
          style.visibility = layout.visible ? 'visible' : 'hidden';
          style.zIndex = String(Math.round(100 - layout.distance * 20));
        }
        if (flipChanged) style.setProperty('--disc-flip', `${index === state.flipIndex ? state.flip.value : 0}deg`);
        const hover = state.hovers[index];
        if (layoutDirty || hover !== previousHovers[index]) {
          const x = hover.x.value;
          const y = hover.y.value;
          style.setProperty('--cursor-pitch', `${-y * 10}deg`);
          style.setProperty('--cursor-yaw', `${x * 18}deg`);
          style.setProperty('--cursor-drift-x', `${x * 8}px`);
          style.setProperty('--cursor-drift-y', `${y * 6}px`);
          style.setProperty('--light-x', `${36 + x * 35}%`);
          style.setProperty('--light-y', `${24 + y * 30}%`);
          style.setProperty('--foil-angle', `${24 + x * 42 + y * 18}deg`);
          style.setProperty('--light-strength', `${.35 + hover.light.value * .45}`);
          style.setProperty('--edge-shift', `${3 + x}px`);
          node.classList.toggle('is-hovered', index === state.hovered);
        }
      });
      layoutDirty = false;
      previousPosition = state.position.value;
      previousFlip = state.flip.value;
      previousHovers = state.hovers;
    };
    const tick = (time: number) => {
      frame = 0;
      if (disposed || document.hidden) return;
      const dt = previousTime ? (time - previousTime) / 1000 : 1 / 60;
      previousTime = time;
      const target = state.target + state.drag;
      if (state.reduced) {
        state.position = spring(state.target); state.flip = spring(state.tf);
      } else {
        state.position = settled(state.position, target) ? spring(target) : advanceSpring(state.position, target, dt, gesture.current.dragging ? 26 : 12);
        state.flip = settled(state.flip, state.tf) ? spring(state.tf) : advanceSpring(state.flip, state.tf, dt, 11);
      }
      state.hovers = advanceDiscHovers(state.hovers, state.hovered, state.tx, state.ty, dt, state.reduced);
      paint();
      const hoverMoving = state.hovers.some((hover, index) => {
        const selected = state.hovered === index;
        return !settled(hover.x, selected ? state.tx : 0) || !settled(hover.y, selected ? state.ty : 0) || !settled(hover.light, selected ? 1 : 0);
      });
      const moving = !state.reduced && (!settled(state.position, target) || hoverMoving || !settled(state.flip, state.tf));
      if (moving) frame = requestAnimationFrame(tick);
      else previousTime = 0;
    };
    const start = () => { if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(tick); };
    wake.current = start;
    const preference = () => { state.reduced = motion.matches; start(); };
    const visibility = () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; previousTime = 0; state.tx = 0; state.ty = 0; state.hovered = -1; state.drag = 0; gesture.current.id = -1; gesture.current.dragging = false; }
      else start();
    };
    let wheelSum = 0;
    let lastWheel = 0;
    let lastChange = -500;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheel > 150 || Math.sign(delta) !== Math.sign(wheelSum)) wheelSum = 0;
      lastWheel = now;
      wheelSum += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? root.clientHeight : 1);
      if (Math.abs(wheelSum) >= 45 && now - lastChange > 300) {
        callbacks.current.onPreview((callbacks.current.active + (wheelSum > 0 ? 1 : -1) + discs.length) % discs.length);
        wheelSum = 0; lastChange = now;
      }
    };
    const resize = new ResizeObserver(() => {
      // Measure only on resize. Pointer movement never asks layout for bounds.
      const discWidth = nodes.current[0]?.offsetWidth || 320;
      state.spacing = Math.max(root.clientWidth * .82, discWidth * 1.7);
      layoutDirty = true; aimBounds.current.index = -1; start();
    });
    resize.observe(root);
    root.addEventListener('wheel', wheel, { passive: false });
    motion.addEventListener('change', preference);
    document.addEventListener('visibilitychange', visibility);
    preference();
    return () => { disposed = true; resize.disconnect(); cancelAnimationFrame(frame); root.removeEventListener('wheel', wheel); motion.removeEventListener('change', preference); document.removeEventListener('visibilitychange', visibility); wake.current = () => {}; };
  }, [discs.length]);

  useEffect(() => {
    const state = model.current;
    state.target += circularOffset(active - state.previous, discs.length);
    state.previous = active;
    state.tf = 0;
    state.hovered = -1; aimBounds.current.index = -1;
    setFlipped(false);
    wake.current();
  }, [active, discs.length]);

  const clearAim = () => {
    model.current.hovered = -1; model.current.tx = 0; model.current.ty = 0;
    aimBounds.current.index = -1; wake.current();
  };
  const aim = (event: PointerEvent<HTMLDivElement>) => {
    const state = model.current;
    if (state.reduced || event.pointerType === 'touch' || gesture.current.dragging) return;
    const button = (event.target as Element).closest<HTMLButtonElement>('.mood-disc');
    const index = button ? nodes.current.indexOf(button) : -1;
    if (index < 0 || index !== callbacks.current.active) { if (state.hovered !== -1) clearAim(); return; }
    if (aimBounds.current.index !== index) {
      // Use the untransformed layout box, avoiding cursor/tilt feedback jitter.
      const bounds = event.currentTarget.getBoundingClientRect();
      aimBounds.current = { index, left: bounds.left + button!.offsetLeft, top: bounds.top + button!.offsetTop, width: button!.offsetWidth, height: button!.offsetHeight };
    }
    const bounds = aimBounds.current;
    state.hovered = index;
    state.tx = clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
    state.ty = clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
    wake.current();
  };
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const touch = gesture.current;
    if (event.pointerId !== touch.id) return;
    if (touch.dragging) {
      touch.suppressUntil = performance.now() + 350;
      if (!cancelled) {
        const step = model.current.spacing;
        const distance = Math.max(1, Math.min(2, Math.round(Math.abs(touch.dx) / step)));
        if (Math.abs(touch.dx) > 38) onPreview((active + (touch.dx < 0 ? distance : -distance) + discs.length) % discs.length);
      }
    }
    touch.id = -1; touch.dragging = false;
    model.current.drag = 0;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.pointerType === 'touch' || cancelled) clearAim();
    wake.current();
  };
  const flip = () => { const next = !flipped; setFlipped(next); const state = model.current; if (state.flipIndex !== active) { state.flipIndex = active; state.flip = spring(); } state.tf = next ? 180 : 0; wake.current(); };

  return <div ref={gallery} className="disc-gallery" role="region" aria-roledescription="carousel" aria-label="Mood disc collection" tabIndex={0}
    onKeyDown={event => {
      if (event.target instanceof Element && event.target.closest('[data-gallery-control]')) return;
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) event.currentTarget.focus({ preventScroll: true });
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); onPreview((active + (event.key === 'ArrowRight' ? 1 : -1) + discs.length) % discs.length); }
      else if (event.key === ' ') { event.preventDefault(); flip(); }
      else if (event.key === 'Enter' && event.target === event.currentTarget) { event.preventDefault(); onSelect(active); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); onPreview(event.key === 'Home' ? 0 : discs.length - 1); }
    }}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('[data-gallery-control]')) return;
      gesture.current = { ...gesture.current, id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dragging: false, vertical: false };
      aim(event);
    }}
    onPointerMove={event => {
      aim(event);
      const touch = gesture.current;
      if (touch.id !== event.pointerId || touch.vertical) return;
      const dx = event.clientX - touch.x;
      const dy = event.clientY - touch.y;
      if (!touch.dragging && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { touch.vertical = true; return; }
      if (!touch.dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { touch.dragging = true; clearAim(); event.currentTarget.setPointerCapture(event.pointerId); }
      if (touch.dragging) { touch.dx = dx; model.current.drag = -dx / model.current.spacing; wake.current(); }
    }}
    onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
    onLostPointerCapture={event => { if (gesture.current.id === event.pointerId) finish(event, true); }}
    onPointerLeave={() => { if (!gesture.current.dragging) { gesture.current.id = -1; clearAim(); } }}>
    <div className="gallery-orbit" aria-hidden="true" />
    {discs.map((disc, index) => {
      const initial = circularOffset(index - initialActive.current, discs.length);
      return <button ref={node => { nodes.current[index] = node; }} key={disc.name} type="button" className={`mood-disc ${index === active ? 'is-front' : ''}`}
        style={{ '--disc-accent': disc.color, '--disc-x': `${initial * 600}px`, '--disc-y': `${initial * -24}px`, '--disc-z': `${-Math.abs(initial) * 80}px`, '--disc-scale': 1 - Math.abs(initial) * .035, '--disc-angle': `${-14 - initial * 6}deg`, opacity: initial === 0 ? 1 : 0, visibility: initial === 0 ? 'visible' : 'hidden' } as CSSProperties}
        tabIndex={index === active ? 0 : -1}
        onClick={() => { if (performance.now() < gesture.current.suppressUntil) return; if (index === active) onSelect(index); else onPreview(index); }}
        aria-label={index === active ? `Enter ${disc.name} mood` : `Browse ${disc.name} mood`} aria-current={index === active ? 'true' : undefined} data-testid={`button-mood-${disc.name.toLowerCase()}`}>
        <span className="mood-disc-motion"><span className="mood-disc-face">
          <img src={disc.art} alt="" draggable={false} /><span className="disc-print"><small>MOOSIC / VOL. 0{index + 1}</small><strong>{disc.name}</strong><span>{disc.subtitle}</span></span><span className="disc-hub" /><span className="disc-rim" /><span className="disc-specular" /><span className="disc-diffraction" /><span className="disc-grooves" />
        </span><span className="disc-back" aria-hidden="true"><span className="disc-back-inscription"><strong>MOOSIC</strong><span>COMPACT DISC · DIGITAL AUDIO</span><small>THE MOOD COLLECTION / VOL. 0{index + 1}</small></span><span className="disc-back-label"><strong>{disc.name}</strong><small>{disc.subtitle}</small></span><span className="disc-back-matrix">MOOSIC · 00{index + 1} / MASTERED FOR YOUR CURRENT SELF</span><span className="disc-hub" /><span className="disc-rim" /></span></span>
      </button>;
    })}
    <button className="disc-flip-button" type="button" data-gallery-control aria-label={flipped ? 'Show disc artwork' : 'Flip the current disc'} aria-pressed={flipped} onClick={flip}><Rotate3D size={16} /><span>{flipped ? 'Artwork' : 'Flip disc'}</span></button>
  </div>;
}
