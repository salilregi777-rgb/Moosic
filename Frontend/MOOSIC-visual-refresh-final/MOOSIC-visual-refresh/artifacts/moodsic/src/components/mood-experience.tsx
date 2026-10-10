import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useScroll, useTransform, useMotionValueEvent, type MotionValue } from 'framer-motion';
import { ArrowDown, ArrowLeft, ArrowRight, Heart, Pause, Play } from 'lucide-react';
import { Link } from 'wouter';
import { PhysicalDisc } from './physical-disc';
import { InteractiveCD } from './cd/interactive-cd';
import { SongArtwork } from './song-artwork';
import { accumulateScroll, GESTURE_IDLE, newGesture, swipeDirection } from '../lib/showcase-gesture';
import { adjacentMood, durationLabel, MOOD_ORDER, type GalleryMoodName } from '../lib/mood-navigation';
import { DISC_PROGRESS, DISC_Y, DISC_ROTATION, DISC_TILT, DISC_SCALE, NEXT_MOOD_COMMIT, NEXT_MOOD_SCROLL_SCREENS, splitEditorialTitle } from '../lib/next-mood-motion';
import './mood-experience.css';
export type MoodTrack = { id?: number; title: string; artist: string; duration: string; mood: GalleryMoodName; audioUrl?: string; coverUrl?: string };
export type MoodEdition = { loading?: boolean; name: GalleryMoodName; art: string; color: string; description: string; title: string; tracks: MoodTrack[] };
export type PlaybackView = { trackId?: number; mood?: GalleryMoodName; playing: boolean; likedIds: Set<number> };
export type GalleryPlayerControls = { toggle: () => void; favorite: (track: MoodTrack) => void };
const spring = { type: 'spring' as const, stiffness: 70, damping: 22 };
function HomeDisc({ edition, index, position, selected, entering, onClick }: { edition: MoodEdition; index: number; position: MotionValue<number>; selected: boolean; entering: boolean; onClick: () => void }) {
  const reduced = useReducedMotion();
  const distance = useTransform(position, value => index - value);
  const x = useTransform(distance, value => `${value * 89}%`);
  const y = useTransform(distance, value => reduced ? 0 : Math.abs(value) * -70);
  const rotate = useTransform(distance, value => reduced ? 0 : -18 + value * 25);
  const rotateY = useTransform(distance, value => reduced ? 0 : -18 + value * 12);
  const scale = useTransform(distance, value => 1 - Math.min(2, Math.abs(value)) * .09);
  const opacity = useTransform(distance, [-2, -1.3, 0, 1.4, 2], [0, .5, 1, .8, 0]);
  return <motion.button className={`gallery-record ${selected ? 'is-featured' : ''}`} style={{ x, y, rotate, rotateY, scale, opacity, zIndex: selected ? 2 : 1 }} tabIndex={selected || Math.abs(index - Math.round(position.get())) === 1 ? 0 : -1}
    disabled={entering} data-mood={edition.name} aria-label={selected ? `Enter ${edition.name} mood` : `Feature ${edition.name} mood`} onClick={onClick}>
    <InteractiveCD frozen={entering}><PhysicalDisc {...edition} interactive={false} /></InteractiveCD>
  </motion.button>;
}
export function MoodGalleryHome({ editions, onEnter }: { editions: MoodEdition[]; playback: PlaybackView; onEnter: (mood: GalleryMoodName, source?: HTMLButtonElement) => Promise<void> }) {
  const [index, setIndex] = useState(0), [entering, setEntering] = useState(false);
  const reduced = Boolean(useReducedMotion());
  const position = useMotionValue(0);
  const region = useRef<HTMLDivElement>(null);
  const gesture = useRef(newGesture());
  const controls = useRef<ReturnType<typeof animate> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const entryLock = useRef(false);
  const drag = useRef({ x: 0, y: 0, origin: 0, active: false, suppressUntil: 0 });
  const callbacks = useRef({ index, entering, browse: (_index: number) => {} });
  const browse = (next: number) => {
    if (entering) return;
    clearTimeout(timer.current);
    const target = Math.max(0, Math.min(editions.length - 1, next));
    setIndex(target); controls.current?.stop();
    controls.current = animate(position, target, reduced ? { duration: 0 } : spring);
  };
  callbacks.current = { index, entering, browse };
  const enter = () => {
    if (entryLock.current || performance.now() < drag.current.suppressUntil) return;
    entryLock.current = true;
    controls.current?.stop(); clearTimeout(timer.current);
    const source = region.current?.querySelector<HTMLButtonElement>(`[data-mood="${editions[index].name}"]`);
    // Capture the live hover pose before the frozen state renders.
    const transition = onEnter(editions[index].name, source ?? undefined);
    setEntering(true);
    void transition.finally(() => { entryLock.current = false; setEntering(false); });
  };
  useEffect(() => {
    const element = region.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !matchMedia('(min-width:800px) and (pointer:fine)').matches || callbacks.current.entering) return;
      const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      const result = accumulateScroll(gesture.current, delta, performance.now(), callbacks.current.index, editions.length);
      gesture.current = result.state;
      if (!result.capture) return;
      event.preventDefault(); clearTimeout(timer.current);
      if (result.commit) callbacks.current.browse(callbacks.current.index + result.commit);
      else if (!result.state.latched) {
        controls.current?.stop();
        controls.current = animate(position, callbacks.current.index + result.progress * .45, { duration: reduced ? 0 : .12 });
        timer.current = setTimeout(() => callbacks.current.browse(callbacks.current.index), GESTURE_IDLE + 30);
      }
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); controls.current?.stop(); clearTimeout(timer.current); };
  }, [editions.length, position, reduced]);
  const active = editions[index];
  return <section className={`mood-front ${entering ? 'is-entering' : ''}`} aria-label="Mood gallery" style={{ '--edition-color': active.color } as CSSProperties}>
    <div className="mood-front-copy" aria-live="polite"><span className="edition-eyebrow">MOOSIC / MOOD COLLECTION {String(index + 1).padStart(2, '0')}</span><h1>{active.name}</h1><h2>{active.title}</h2><p>{active.description}</p><dl><div><dt>COLLECTION</dt><dd>{active.loading ? 'Loading…' : `${active.tracks.length} tracks`}</dd></div><div><dt>RUNNING TIME</dt><dd>{active.loading ? '—' : durationLabel(active.tracks)}</dd></div></dl><button className="editorial-link" onClick={enter} disabled={entering}>Enter this mood <ArrowRight size={18} /></button></div>
    <div ref={region} className="mood-front-records" role="region" tabIndex={0} aria-label="Browse mood CDs" onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); browse(index + (event.key === 'ArrowRight' ? 1 : -1)); }
      if (event.key === 'Enter') enter();
    }} onDragStart={event => event.preventDefault()} onPointerDown={event => { if (event.button !== 0 || entryLock.current) return; clearTimeout(timer.current); controls.current?.stop(); drag.current = { ...drag.current, x: event.clientX, y: event.clientY, origin: position.get(), active: true }; }}
      onPointerMove={event => {
        if (!drag.current.active || event.pointerType === 'touch') return;
        const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
        if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { event.currentTarget.setPointerCapture(event.pointerId); controls.current?.stop(); position.set(Math.max(0, Math.min(editions.length - 1, drag.current.origin - dx / Math.max(260, event.currentTarget.clientWidth * .49)))); }
      }} onPointerUp={event => {
        if (!drag.current.active) return;
        const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
        drag.current.active = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        const direction = swipeDirection(dx, dy);
        if (direction) { drag.current.suppressUntil = performance.now() + 450; browse(index + direction); }
        else if (Math.abs(dx) > 12) { drag.current.suppressUntil = performance.now() + 450; browse(index); }
      }} onPointerCancel={() => { drag.current.active = false; browse(index); }} onPointerLeave={() => { if (drag.current.active) { drag.current.active = false; browse(index); } }}>
      {editions.map((edition, discIndex) => <HomeDisc key={edition.name} edition={edition} index={discIndex} position={position} selected={index === discIndex} entering={entering} onClick={() => { if (performance.now() < drag.current.suppressUntil) return; if (discIndex === index) enter(); else browse(discIndex); }} />)}
    </div>
    <div className="mood-front-footer"><span>DRAG TO DISCOVER / CLICK TO ENTER</span><div className="edition-arrows"><button aria-label="Previous mood" onClick={() => browse(index - 1)} disabled={index === 0 || entering}><ArrowLeft size={19} /></button><span>{String(index + 1).padStart(2, '0')} / 05</span><button aria-label="Next mood" onClick={() => browse(index + 1)} disabled={index === editions.length - 1 || entering}><ArrowRight size={19} /></button></div><span>A RECORD FOR EVERY VERSION OF YOU</span></div>
  </section>;
}

function MoodHero({ edition, playing }: { edition: MoodEdition; playing: boolean }) {
  return <section className="edition-hero" aria-label={`${edition.name} collection introduction`}>
    <div className="edition-hero-heading"><span className="edition-eyebrow">THE MOOSIC COLLECTION / {String(MOOD_ORDER.indexOf(edition.name) + 1).padStart(2, '0')}</span><h1>{edition.title}</h1><div className="edition-hero-rule"><span>{edition.name}</span><span>{edition.loading ? 'LOADING TRACKS' : `${edition.tracks.length} TRACKS`}</span><span>{edition.loading ? '—' : durationLabel(edition.tracks)}</span></div></div>
    <div className="edition-hero-disc" style={{ viewTransitionName: `mood-disc-${edition.name.toLowerCase()}` }}><PhysicalDisc {...edition} playing={playing} /></div>
    <a className="edition-hero-scroll" href="#mood-tracklist">Scroll to the music <ArrowDown size={14} /></a>
  </section>;
}
function NextMoodTransition({ next, onNavigate }: { next?: MoodEdition; onNavigate: (mood: GalleryMoodName) => void }) {
  const track = useRef<HTMLElement>(null);
  const reduced = Boolean(useReducedMotion());
  const committed = useRef(false);
  const scrollIntent = useRef(false);
  useEffect(() => {
    // History restoration and layout measurements must never commit navigation.
    // These passive listeners observe intent; native scrolling still controls the timeline.
    const arm = () => { scrollIntent.current = true; };
    const key = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', ' '].includes(event.key)) arm();
    };
    window.addEventListener('wheel', arm, { passive: true });
    window.addEventListener('touchmove', arm, { passive: true });
    window.addEventListener('pointerdown', arm, { passive: true });
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('wheel', arm);
      window.removeEventListener('touchmove', arm);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const { scrollYProgress: progress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const y = useTransform(progress, DISC_PROGRESS, DISC_Y);
  const rotate = useTransform(progress, DISC_PROGRESS, DISC_ROTATION);
  const rotateX = useTransform(progress, DISC_PROGRESS, DISC_TILT);
  const scale = useTransform(progress, DISC_PROGRESS, DISC_SCALE);
  const leftX = useTransform(progress, [0, .45, .82, 1], ['0vw', '-4vw', '-20vw', '-28vw']);
  const rightX = useTransform(progress, [0, .45, .82, 1], ['0vw', '4vw', '20vw', '28vw']);
  const titleOpacity = useTransform(progress, [0, .5, .85], [1, 1, 0]);
  const lineScale = useTransform(progress, [0, .45, .9], [1, 1, .12]);
  const navigate = () => {
    if (!next || committed.current) return;
    committed.current = true;
    onNavigate(next.name);
  };
  // No wheel interception, elapsed-time tween, idle reset, or progress state updates.
  // Native page scrolling is the sole input; stopping leaves every layer in place.
  useMotionValueEvent(progress, 'change', value => {
    if (!reduced && scrollIntent.current && value >= NEXT_MOOD_COMMIT) navigate();
  });
  const title = splitEditorialTitle(next?.title ?? 'Every feeling belongs');
  return <section ref={track} className={`mood-next-track ${!next || reduced ? 'is-static' : ''}`} style={{ '--scroll-screens': NEXT_MOOD_SCROLL_SCREENS } as CSSProperties} aria-label={next ? `Continue to ${next.name}` : 'End of the mood collection'}>
    <div className="mood-next-stage">
      <div className="mood-next-overline"><span>{next ? `NEXT MOOD / ${next.name}` : 'THE LAST SIDE'}</span><span>{next ? `${String(MOOD_ORDER.indexOf(next.name) + 1).padStart(2, '0')} / 05` : '05 / 05'}</span></div>
      <div className="next-title-bands" aria-label={next?.title ?? 'Every feeling belongs'}>
        <motion.div className="next-title-rule" style={reduced ? {} : { scaleX: lineScale }} />
        <motion.h2 style={reduced ? {} : { x: leftX, opacity: titleOpacity }}>{title[0]}</motion.h2>
        <motion.div className="next-title-rule" style={reduced ? {} : { scaleX: lineScale }} />
        <motion.p className="next-title-second" style={reduced ? {} : { x: rightX, opacity: titleOpacity }}>{title[1]}</motion.p>
        <motion.div className="next-title-rule" style={reduced ? {} : { scaleX: lineScale }} />
      </div>
      {next && <motion.div className="destination-disc" data-destination={next.name} style={{ ...(reduced ? {} : { y, rotate, rotateX, scale }), viewTransitionName: `mood-disc-${next.name.toLowerCase()}` }}><PhysicalDisc {...next} /></motion.div>}
      <div className="next-mood-actions"><div><span>{next ? `${next.tracks.length} TRACKS / ${durationLabel(next.tracks)}` : 'YOU’VE REACHED THE END'}</span><p>{next?.description ?? 'Find another mood whenever you’re ready.'}</p></div>{next ? <button className="editorial-link" onClick={navigate}>Enter {next.name} <ArrowRight size={18} /></button> : <Link href="/" className="editorial-link">All moods <ArrowLeft size={18} /></Link>}</div>
      <div className="next-scroll-caption"><span>{next && !reduced ? 'SCROLL TO CONTINUE · SCROLL BACK TO REVERSE' : 'SELECT A MOOD TO CONTINUE'}</span><a href="#mood-tracklist">Back to songs ↑</a></div>
      <div className="mood-next-progress"><motion.span style={{ scaleX: progress }} /></div>
    </div>
  </section>;
}
export function MoodPlaylistPage({ edition, editions, playback, onPlay, onToggle, onFavorite, onNavigate }: { edition: MoodEdition; editions: MoodEdition[]; playback: PlaybackView; onPlay: (track?: MoodTrack) => void; onToggle: () => void; onFavorite: (track: MoodTrack) => void; onNavigate: (mood: GalleryMoodName) => void }) {
  const reduced = useReducedMotion();
  const previous = adjacentMood(edition.name, -1), nextName = adjacentMood(edition.name, 1);
  useLayoutEffect(() => {
    // Restoring a completed scroll track on Back would immediately navigate forward again.
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, behavior: 'instant' });
    return () => { window.history.scrollRestoration = restoration; };
  }, [edition.name]);
  return <article className="mood-edition" style={{ '--edition-color': edition.color } as CSSProperties}>
    <nav className="mood-edition-nav" aria-label="Mood navigation"><Link href="/">All moods</Link>{previous && <button onClick={() => onNavigate(previous)}><ArrowLeft size={14} /> Previous mood: {previous}</button>}<span>{edition.name} / MOOSIC</span></nav>
    <MoodHero edition={edition} playing={playback.playing && playback.mood === edition.name} />
    <section className="mood-track-section" id="mood-tracklist" aria-label={`${edition.name} songs`}>
      <motion.div className="mood-track-heading" initial={reduced ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .7 }}><div><span className="edition-eyebrow">THE TRACKLIST / {edition.name}</span><h2>{edition.title}</h2><p>{edition.description}</p><small>{edition.tracks.length} tracks · {edition.loading ? '—' : durationLabel(edition.tracks)}</small></div><button className="edition-play" disabled={!edition.tracks.length} onClick={() => onPlay()}><Play size={16} fill="currentColor" /> Play this mood</button></motion.div>
      <ol className="editorial-tracklist">{edition.tracks.map((track, index) => {
        const active = track.id != null && playback.trackId === track.id;
        return <li key={track.id ?? track.title} className={active ? 'active' : ''} aria-current={active ? 'true' : undefined}><span className="track-number">{String(index + 1).padStart(2, '0')}</span><SongArtwork track={track} /><button className="editorial-track-name" onClick={() => active ? onToggle() : onPlay(track)} aria-label={`${active && playback.playing ? 'Pause' : 'Play'} ${track.title}`}><strong>{track.title}</strong><span>{track.artist}<small className="mobile-track-duration"> · {track.duration}</small></span></button><span className="track-duration">{track.duration}</span><button className="track-icon" aria-label={`${active && playback.playing ? 'Pause' : 'Play'} track ${track.title}`} onClick={() => active ? onToggle() : onPlay(track)}>{active && playback.playing ? <Pause size={17} /> : <Play size={17} />}</button><button className="track-icon" disabled={!track.id} aria-label={`${playback.likedIds.has(track.id ?? -1) ? 'Unfavorite' : 'Favorite'} ${track.title}`} aria-pressed={playback.likedIds.has(track.id ?? -1)} onClick={() => onFavorite(track)}><Heart size={17} fill={playback.likedIds.has(track.id ?? -1) ? 'currentColor' : 'none'} /></button></li>;
      })}</ol>
      {!edition.tracks.length && <p className="mood-empty">{edition.loading ? 'Loading your music…' : 'No playable songs have loaded for this mood yet.'}</p>}
    </section>
    <NextMoodTransition key={edition.name} next={editions.find(item => item.name === nextName)} onNavigate={onNavigate} />
  </article>;
}
