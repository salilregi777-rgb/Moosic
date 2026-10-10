import { useCallback, useEffect, useRef } from 'react';
import type { GalleryMoodName } from '../../lib/mood-navigation';

/** A temporary visual clone crosses the route boundary; the audio player never remounts. */
export function useCDEntry(navigate: (mood: GalleryMoodName) => void) {
  const destination = useRef(navigate);
  destination.current = navigate;
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const cancel = () => active.current?.abort();
    const link = (event: MouseEvent) => { if ((event.target as Element)?.closest?.('a[href]')) cancel(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    document.addEventListener('click', link, true);
    document.addEventListener('keydown', escape);
    window.addEventListener('popstate', cancel);
    window.addEventListener('resize', cancel);
    return () => { cancel(); document.removeEventListener('click', link, true); document.removeEventListener('keydown', escape); window.removeEventListener('popstate', cancel); window.removeEventListener('resize', cancel); };
  }, []);
  return useCallback(async (mood: GalleryMoodName, source?: HTMLButtonElement) => {
    if (active.current) return;
    if (!source || matchMedia('(prefers-reduced-motion: reduce)').matches || document.visibilityState === 'hidden') {
      destination.current(mood); return;
    }
    const controller = new AbortController();
    active.current = controller;
    const animations: Animation[] = [];
    let stage: HTMLDivElement | undefined;
    const run = (element: Element, frames: Keyframe[], duration: number, easing = 'cubic-bezier(.22,.7,.25,1)') => {
      const animation = element.animate(frames, { duration, easing, fill: 'forwards' });
      animations.push(animation);
      return animation.finished;
    };
    const cancel = () => animations.forEach(animation => animation.cancel());
    controller.signal.addEventListener('abort', cancel, { once: true });
    try {
      const gallery = source.closest<HTMLElement>('.mood-front-records')!;
      const bounds = gallery.getBoundingClientRect();
      const sourceStyle = getComputedStyle(source);
      const width = source.offsetWidth;
      const left = source.offsetLeft, top = source.offsetTop;
      const clone = source.cloneNode(true) as HTMLButtonElement;
      // Snapshot the complete current hover pose before React freezes its render loop.
      const originals = [source, ...source.querySelectorAll<HTMLElement>('*')];
      const copies = [clone, ...clone.querySelectorAll<HTMLElement>('*')];
      originals.forEach((original, index) => {
        const style = getComputedStyle(original);
        Object.assign(copies[index].style, { transform: style.transform, opacity: style.opacity, animation: 'none', transition: 'none' });
        copies[index].removeAttribute('id');
      });
      clone.disabled = true; clone.tabIndex = -1;
      clone.style.left = `${left}px`; clone.style.top = `${top}px`; clone.style.width = `${width}px`;
      stage = document.createElement('div');
      stage.className = 'mood-front-records cd-entry-stage';
      stage.setAttribute('aria-hidden', 'true'); stage.inert = true;
      Object.assign(stage.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, perspective: getComputedStyle(gallery).perspective });
      stage.append(clone); document.body.append(stage);
      source.style.visibility = 'hidden';
      document.documentElement.dataset.cdEntering = mood;
      const baseX = left + width / 2, baseY = top + width / 2;
      const centerX = innerWidth / 2 - bounds.left, centerY = innerHeight * .52 - bounds.top;
      const middleScale = Math.min(innerWidth * .32, innerHeight * .48) / width;
      const pose = (cx: number, cy: number, scale: number, yaw: number, roll: number, depth = 0) =>
        `translate3d(${cx - baseX}px,${cy - baseY}px,${depth}px) rotateX(0deg) rotateY(${yaw}deg) rotateZ(${roll}deg) scale(${scale})`;
      const middle = pose(centerX, centerY, middleScale, -18, -8);
      const sketch = clone.querySelector('.cd-sketch');
      if (sketch) void run(sketch, [{ opacity: getComputedStyle(sketch).opacity }, { opacity: 0 }], 180).catch(() => {});
      const hover = clone.querySelector('.cd-hover-surface');
      if (hover) void run(hover, [{ transform: getComputedStyle(hover).transform }, { transform: 'none' }], 430).catch(() => {});
      // The reference clears the neighbours before the selected disc recedes.
      gallery.querySelectorAll<HTMLElement>('.gallery-record').forEach(peer => {
        if (peer === source) return;
        void run(peer, [
          { transform: getComputedStyle(peer).transform, opacity: getComputedStyle(peer).opacity },
          { transform: `${getComputedStyle(peer).transform} translateY(100px) scale(.35)`, opacity: 0 },
        ], 340).catch(() => {});
      });
      await run(clone, [{ transform: sourceStyle.transform }, { transform: middle }], 430);
      if (controller.signal.aborted) return;
      // Navigate only after the disc is isolated. This callback commits React synchronously.
      destination.current(mood);
      const hero = document.querySelector<HTMLElement>('.edition-hero-disc');
      if (!hero) return;
      const target = hero.getBoundingClientRect();
      const targetX = target.left + target.width / 2 - bounds.left;
      const targetY = target.top + target.height / 2 - bounds.top;
      const scale = hero.offsetWidth / width;
      document.querySelectorAll('.edition-hero-heading,.edition-hero-scroll,.mood-edition-nav').forEach((element, index) => {
        void run(element, [{ opacity: 0, transform: `translateY(${index === 1 ? 28 : 12}px)` }, { opacity: 1, transform: 'translateY(0)' }], 520).catch(() => {});
      });
      await run(clone, [
        { transform: middle, offset: 0 },
        { transform: pose(centerX + (targetX - centerX) * .55, centerY + (targetY - centerY) * .55, Math.max(scale, middleScale * .7), 64, 10, -130), offset: .58 },
        { transform: pose(targetX, targetY, scale, 0, -15), offset: 1 },
      ], 570, 'cubic-bezier(.4,0,.2,1)');
      const heading = document.querySelector<HTMLElement>('.edition-hero-heading h1');
      heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true });
    } catch (error) {
      // Cancellation is expected on browser history, resize or unmount.
      if (!controller.signal.aborted) { console.error('CD entry transition failed', error); destination.current(mood); }
    } finally {
      stage?.remove(); source.style.visibility = '';
      delete document.documentElement.dataset.cdEntering;
      animations.forEach(animation => animation.cancel());
      controller.signal.removeEventListener('abort', cancel);
      if (active.current === controller) active.current = null;
    }
  }, []);
}
