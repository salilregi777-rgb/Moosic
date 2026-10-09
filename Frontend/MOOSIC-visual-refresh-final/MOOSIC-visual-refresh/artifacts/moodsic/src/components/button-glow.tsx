import { useEffect } from 'react';

// The same pointer-following edge light used in EXIT CODE 0, in Moosic gold.
export function ButtonGlow() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const selector = '.solid-button, .outline-button, .icon-button, .play-button, .player-control, .auth-submit';
    let frame = 0;
    let target: HTMLElement | null = null;
    let x = 0, y = 0;
    const move = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (!element || element.matches(':disabled')) return;
      target = element; x = event.clientX; y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!target?.isConnected) return;
        const rect = target.getBoundingClientRect();
        target.style.setProperty('--glow-angle', `${Math.atan2(y - rect.top - rect.height / 2, x - rect.left - rect.width / 2) * 180 / Math.PI + 90}deg`);
        target.style.setProperty('--glow-x', `${x - rect.left}px`);
        target.style.setProperty('--glow-y', `${y - rect.top}px`);
      });
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => { document.removeEventListener('pointermove', move); cancelAnimationFrame(frame); };
  }, []);
  return null;
}
