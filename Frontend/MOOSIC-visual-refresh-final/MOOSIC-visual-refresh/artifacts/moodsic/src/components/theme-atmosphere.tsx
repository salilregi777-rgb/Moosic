import { Component, Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { RoomTheme } from '@/lib/themes';

const Aurora = lazy(() => import('./react-bits/Aurora'));
const Particles = lazy(() => import('./react-bits/Particles'));
const Waves = lazy(() => import('./react-bits/Waves'));
const Threads = lazy(() => import('./react-bits/Threads'));
const Iridescence = lazy(() => import('./react-bits/Iridescence'));

class AtmosphereBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export function ThemeAtmosphere({ theme }: { theme: RoomTheme }) {
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setAnimate(!motion.matches && document.visibilityState === 'visible');
    update(); motion.addEventListener('change', update); document.addEventListener('visibilitychange', update);
    return () => { motion.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
  }, []);
  const rgb = useMemo(() => [1, 3, 5].map(i => parseInt(theme.accent.slice(i, i + 2), 16) / 255) as [number, number, number], [theme.accent]);
  const colors = useMemo(() => [theme.accent, theme.background, theme.accent], [theme]);
  return <div className={`theme-atmosphere atmosphere-${theme.effect}`} aria-hidden="true" data-effect={theme.effect}>
    <div className="atmosphere-halo" />
    {animate && <AtmosphereBoundary key={theme.effect}><Suspense fallback={null}>
      {theme.effect === 'aurora' && <Aurora colorStops={colors} amplitude={.7} blend={.6} speed={.25} />}
      {theme.effect === 'particles' && <Particles particleCount={65} particleColors={colors} particleBaseSize={65} speed={.025} alphaParticles pixelRatio={1} />}
      {theme.effect === 'waves' && <Waves lineColor={theme.accent} waveSpeedX={.003} waveSpeedY={.002} waveAmpX={24} waveAmpY={12} xGap={24} yGap={42} maxCursorMove={20} />}
      {theme.effect === 'threads' && <Threads color={rgb} amplitude={.65} distance={.2} enableMouseInteraction={false} />}
      {theme.effect === 'iridescence' && <Iridescence color={rgb} speed={.12} amplitude={.35} mouseReact={false} />}
    </Suspense></AtmosphereBoundary>}
  </div>;
}
