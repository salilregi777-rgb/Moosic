import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { MediaPlayer } from './media-player.ts';
import { resolvePlaybackSource } from './playback-source.ts';

class FakeAudio extends EventTarget {
  static latest: FakeAudio;
  src = '';
  preload = '';
  currentTime = 0;
  duration = 120;
  volume = 1;
  muted = false;
  paused = true;
  playCount = 0;
  loadCount = 0;
  error: { code: number } | null = null;
  playResult: () => Promise<void> = () => Promise.resolve();
  constructor() { super(); FakeAudio.latest = this; }
  load() { this.currentTime = 0; this.error = null; this.loadCount++; }
  play() { this.playCount++; this.paused = false; return this.playResult(); }
  pause() { this.paused = true; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
});

function makePlayer() {
  const states: number[] = [];
  const ready: boolean[] = [];
  const blocked: string[] = [];
  const unavailable: string[] = [];
  const player = new MediaPlayer({} as HTMLElement, {
    onReady: (value) => ready.push(value),
    onState: (value) => states.push(value),
    onBlocked: (value) => blocked.push(value),
    onUnavailable: (value) => unavailable.push(value),
  });
  return { player, audio: FakeAudio.latest, states, ready, blocked, unavailable };
}

const audioSource = resolvePlaybackSource('https://example.supabase.co/storage/v1/object/public/music/song.mp3')!;

test('starts native audio immediately and exposes real timing, volume and seek controls', async () => {
  const { player, audio, states, ready } = makePlayer();
  player.setVolume(60);
  player.loadSource(audioSource);
  assert.equal(audio.playCount, 1, 'play must happen in the initiating gesture');
  assert.equal(audio.volume, 0.6);
  audio.dispatchEvent(new Event('loadedmetadata'));
  audio.dispatchEvent(new Event('playing'));
  assert.deepEqual(ready, [false, true]);
  assert.deepEqual(states, [1]);
  player.seekTo(30);
  assert.equal(player.getCurrentTime(), 30);
  assert.equal(player.getDuration(), 120);
  player.mute();
  assert.equal(audio.muted, true);
  player.unMute();
  assert.equal(audio.muted, false);
  player.pauseVideo();
  assert.equal(audio.paused, true);
  audio.dispatchEvent(new Event('pause'));
  assert.equal(states.at(-1), 2);
  player.destroy();
  assert.equal(audio.src, '');
});

test('autoplay rejection stays recoverable and does not mark the track unavailable', async () => {
  const { player, audio, blocked, unavailable, states } = makePlayer();
  audio.playResult = () => Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
  player.loadSource(audioSource);
  await Promise.resolve();
  assert.equal(blocked.length, 1);
  assert.equal(unavailable.length, 0);
  assert.equal(states.at(-1), 2);
  audio.playResult = () => Promise.resolve();
  player.playVideo();
  assert.equal(audio.playCount, 2);
  player.destroy();
});

test('a superseded play rejection cannot fail or pause the next track', async () => {
  const { player, audio, blocked, unavailable, states } = makePlayer();
  let rejectOldPlay: (error: DOMException) => void = () => {};
  audio.playResult = () => new Promise((_, reject) => { rejectOldPlay = reject; });
  player.loadSource(audioSource);
  audio.playResult = () => Promise.resolve();
  player.loadSource(resolvePlaybackSource('https://example.com/next.mp3')!);
  rejectOldPlay(new DOMException('Unsupported', 'NotSupportedError'));
  await Promise.resolve();
  assert.deepEqual(unavailable, []);
  assert.deepEqual(blocked, []);
  assert.deepEqual(states, []);
  player.destroy();
});

test('native end and inaccessible audio report actionable playback events', () => {
  const { player, audio, unavailable, states } = makePlayer();
  player.loadSource(audioSource, false);
  assert.equal(audio.playCount, 0);
  audio.dispatchEvent(new Event('ended'));
  assert.deepEqual(states, [0]);
  audio.error = { code: 4 };
  audio.dispatchEvent(new Event('error'));
  assert.equal(unavailable.length, 1);
  player.destroy();
});

test('temporary audio network failures retain the song and reload it when Play is retried', () => {
  const { player, audio, unavailable, blocked, states, ready } = makePlayer();
  player.loadSource(audioSource);
  audio.error = { code: 2 };
  audio.dispatchEvent(new Event('error'));
  assert.equal(unavailable.length, 0, 'a connection failure must not blacklist this song');
  assert.equal(blocked.length, 1);
  assert.equal(states.at(-1), 2);
  assert.equal(ready.at(-1), false);
  player.playVideo();
  assert.equal(audio.loadCount, 2, 'retry must clear the old MediaError by loading the source again');
  assert.equal(audio.playCount, 2);
  assert.equal(audio.src, audioSource.kind === 'audio' ? audioSource.url : '');
  player.destroy();
});

test('a non-format audio play failure stays recoverable', async () => {
  const { player, audio, unavailable, blocked } = makePlayer();
  audio.playResult = () => Promise.reject(new DOMException('Connection lost', 'NetworkError'));
  player.loadSource(audioSource);
  await Promise.resolve();
  assert.deepEqual(unavailable, []);
  assert.equal(blocked.length, 1);
  audio.playResult = () => Promise.resolve();
  player.playVideo();
  assert.equal(audio.loadCount, 2);
  player.destroy();
});

test('YouTube uses visible controls and reports blocked autoplay without skipping', async () => {
  let options: { playerVars: Record<string, unknown>; events: Record<string, (event?: unknown) => void> };
  const loaded: string[] = [];
  let pauses = 0;
  class FakeYouTube {
    constructor(_mount: unknown, config: typeof options) { options = config; }
    loadVideoById(id: string) { loaded.push(id); }
    cueVideoById() {}
    playVideo() {}
    pauseVideo() { pauses++; }
    getCurrentTime() { return 42; }
    getDuration() { return 180; }
    setVolume() {}
    mute() {}
    unMute() {}
    seekTo() {}
    destroy() {}
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    YT: { Player: FakeYouTube }, location: { origin: 'https://moosic.example' },
    setTimeout, clearTimeout,
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({}) } });
  const { player, states, blocked, unavailable } = makePlayer();
  // A minimal mount is enough to validate the actual provider wiring.
  Object.assign((player as unknown as { container: object }).container, { replaceChildren() {}, appendChild() {} });
  player.loadSource(resolvePlaybackSource('https://youtu.be/dQw4w9WgXcQ')!);
  await Promise.resolve();
  assert.equal(options!.playerVars.controls, 1);
  options!.events.onReady();
  assert.deepEqual(loaded, ['dQw4w9WgXcQ']);
  assert.equal(player.getCurrentTime(), 42);
  options!.events.onAutoplayBlocked();
  assert.equal(blocked.length, 1);
  assert.deepEqual(states, [2]);
  assert.deepEqual(unavailable, []);
  player.loadSource(audioSource);
  assert.ok(pauses > 0, 'YouTube must stop before native audio starts');
  options!.events.onStateChange({ data: 0 });
  assert.deepEqual(states, [2], 'inactive provider events cannot advance the queue');
  player.destroy();
});

test('a stalled YouTube iframe is retryable and cannot resume after its attempt expires', async () => {
  let timeoutCallback = () => {};
  let constructions = 0;
  let loads = 0;
  const attempts: Array<{ events: { onReady(): void } }> = [];
  class StalledYouTube {
    constructor(_mount: unknown, config: (typeof attempts)[number]) { attempts.push(config); constructions++; }
    pauseVideo() {}
    loadVideoById() { loads++; }
    setVolume() {}
    unMute() {}
    destroy() {}
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    YT: { Player: StalledYouTube }, location: { origin: 'https://moosic.example' },
    setTimeout: (callback: () => void) => { timeoutCallback = callback; return 1; },
    clearTimeout() {},
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({}) } });
  const { player, blocked, ready } = makePlayer();
  Object.assign((player as unknown as { container: object }).container, { replaceChildren() {}, appendChild() {} });
  player.loadSource(resolvePlaybackSource('https://youtu.be/dQw4w9WgXcQ')!);
  await Promise.resolve();
  timeoutCallback();
  assert.equal(blocked.length, 1);
  player.playVideo();
  await Promise.resolve();
  assert.equal(constructions, 2);
  attempts[0].events.onReady();
  assert.equal(loads, 0, 'the expired iframe cannot load a track');
  attempts[1].events.onReady();
  assert.equal(loads, 1);
  assert.equal(ready.at(-1), true);
  player.destroy();
});

test('YouTube player failures are recoverable but removed or restricted videos remain unavailable', async () => {
  type Config = { events: { onReady(): void; onError(event: { data: number }): void; onStateChange(event: { data: number }): void } };
  const attempts: Config[] = [];
  const loads: string[] = [];
  let destroyed = 0;
  class RetryableYouTube {
    constructor(_mount: unknown, config: Config) { attempts.push(config); }
    pauseVideo() {}
    loadVideoById(id: string) { loads.push(id); }
    setVolume() {}
    unMute() {}
    destroy() { destroyed++; }
  }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    YT: { Player: RetryableYouTube }, location: { origin: 'https://moosic.example' },
    setTimeout, clearTimeout,
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({}) } });
  const { player, blocked, unavailable, states } = makePlayer();
  Object.assign((player as unknown as { container: object }).container, { replaceChildren() {}, appendChild() {} });
  player.loadSource(resolvePlaybackSource('https://youtu.be/dQw4w9WgXcQ')!);
  await Promise.resolve();
  attempts[0].events.onReady();
  attempts[0].events.onError({ data: 5 });
  assert.equal(blocked.length, 1);
  assert.deepEqual(unavailable, []);
  assert.equal(states.at(-1), 2);
  player.playVideo();
  await Promise.resolve();
  assert.equal(destroyed, 1);
  assert.equal(attempts.length, 2, 'retry creates a fresh provider instead of reusing its failed player');
  attempts[0].events.onError({ data: 100 });
  assert.deepEqual(unavailable, [], 'an expired player must not fail the new attempt');
  attempts[1].events.onReady();
  assert.deepEqual(loads, ['dQw4w9WgXcQ', 'dQw4w9WgXcQ']);
  attempts[1].events.onError({ data: 153 });
  assert.equal(blocked.length, 2);
  assert.deepEqual(unavailable, [], 'site verification failures must not blacklist individual songs');
  for (const code of [2, 100, 101, 150]) attempts[1].events.onError({ data: code });
  assert.equal(unavailable.length, 4);
  player.destroy();
});
