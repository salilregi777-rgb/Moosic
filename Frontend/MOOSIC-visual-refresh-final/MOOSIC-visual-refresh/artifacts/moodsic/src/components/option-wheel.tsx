import { useCallback, useEffect, useRef, useState } from 'react';
import './option-wheel.css';

export type OptionWheelItem = { label: string; href: string };
export function OptionWheel({ items, onSelect, defaultSelected = 0 }: { items: OptionWheelItem[]; onSelect: (item: OptionWheelItem) => void; defaultSelected?: number }) {
  const [selected, setSelected] = useState(defaultSelected);
  const [offset, setOffset] = useState(defaultSelected);
  const target = useRef(defaultSelected);
  const current = useRef(defaultSelected);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startOffset = useRef(0);
  const wheelDelta = useRef(0);
  const lastWheelStep = useRef(0);
  const raf = useRef(0);
  const animate = useCallback(() => {
    current.current += (target.current - current.current) * .14;
    if (Math.abs(target.current - current.current) < .002) current.current = target.current;
    setOffset(current.current);
    if (current.current !== target.current) raf.current = requestAnimationFrame(animate);
  }, []);
  const moveTo = useCallback((value: number) => {
    target.current = Math.max(0, Math.min(items.length - 1, value));
    setSelected(Math.round(target.current));
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(animate);
  }, [animate, items.length]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { moveTo(defaultSelected); }, [defaultSelected, moveTo]);
  const onWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    wheelDelta.current += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1);
    const now = performance.now();
    if (Math.abs(wheelDelta.current) >= 90 && now - lastWheelStep.current >= 180) {
      moveTo(Math.round(target.current + Math.sign(wheelDelta.current)));
      wheelDelta.current = 0;
      lastWheelStep.current = now;
    }
  };
  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return;
    dragging.current = true; startY.current = event.clientY; startOffset.current = target.current; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => { if (dragging.current) moveTo(startOffset.current + (startY.current - event.clientY) / 55); };
  const finishPointer = () => { if (dragging.current) { dragging.current = false; moveTo(Math.round(target.current)); } };
  return <div className="option-wheel" role="listbox" aria-label="Quick navigation" tabIndex={0} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={finishPointer} onPointerCancel={finishPointer} onKeyDown={event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveTo(Math.round(target.current + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveTo(Math.round(target.current - 1)); }
    if (event.key === 'Enter') { event.preventDefault(); onSelect(items[selected]); }
  }}>
    {items.map((item, index) => {
      const distance = index - offset;
      const magnitude = Math.abs(distance);
      const opacity = Math.max(0, 1 - magnitude * .25);
      const scale = Math.max(.72, 1 - magnitude * .065);
      return <button key={item.href} type="button" role="option" aria-selected={index === selected} className={`option-wheel__item ${index === selected ? 'option-wheel__item--selected' : ''}`} style={{ '--ow-y': `${distance * 54}px`, '--ow-scale': scale, '--ow-opacity': opacity, '--ow-blur': `${Math.max(0, magnitude - .6) * .55}px`, '--ow-p': Math.max(0, 1 - magnitude / 3) } as React.CSSProperties} onFocus={() => moveTo(index)} onClick={() => { moveTo(index); onSelect(item); }}>{item.label}</button>;
    })}
  </div>;
}
