import type { PlaybackSource } from './playback-source';

type YouTubePlayer = {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getVideoData?(): { video_id?: string };
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
};

type YouTubeApi = { Player: new (mount: HTMLElement, options: object) => YouTubePlayer };
type YouTubeWindow = Window & {
  YT?: YouTubeApi;
  onYouTubeIframeAPIReady?: () => void;
};

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  const target = window as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = target.onYouTubeIframeAPIReady;
    let script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    const cleanup = () => {
      window.clearTimeout(timeout);
      script?.removeEventListener('error', failed);
      if (target.onYouTubeIframeAPIReady === ready) target.onYouTubeIframeAPIReady = previousReady;
    };
    const failed = () => {
      cleanup();
      script?.remove();
      reject(new Error('YouTube could not connect. Check your connection and press Play to retry.'));
    };
    const ready = () => {
      cleanup();
      try { previousReady?.(); } catch { /* Another embed must not block this one. */ }
      if (target.YT?.Player) resolve(target.YT);
      else failed();
    };
    const timeout = window.setTimeout(failed, 15000);
    target.onYouTubeIframeAPIReady = ready;
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.addEventListener('error', failed, { once: true });
      document.head.appendChild(script);
    } else {
      script.addEventListener('error', failed, { once: true });
    }
  }).catch((error: unknown) => {
    youtubeApiPromise = null;
    throw error;
  });
  return youtubeApiPromise;
}

type PlaybackEvents = {
  onReady(ready: boolean): void;
  onState(state: number): void;
  onUnavailable(message: string, source: PlaybackSource): void;
  onBlocked(message: string): void;
};

/** One persistent playback surface for native/Supabase audio and YouTube. */
export class MediaPlayer {
  private audio = new Audio();
  private youtube: YouTubePlayer | null = null;
  private youtubeReady = false;
  private youtubeLoading = false;
  private youtubeNeedsReload = false;
  private youtubeAttempt = 0;
  private youtubeReadyTimeout: number | null = null;
  private source: PlaybackSource | null = null;
  private destroyed = false;
  private autoplay = false;
  private generation = 0;
  private volume = 80;
  private muted = false;
  private audioNeedsReload = false;
  private container: HTMLElement;
  private events: PlaybackEvents;

  constructor(container: HTMLElement, events: PlaybackEvents) {
    this.container = container;
    this.events = events;
    this.audio.preload = 'metadata';
    this.audio.addEventListener('loadedmetadata', () => {
      if (this.source?.kind === 'audio') this.events.onReady(true);
    });
    this.audio.addEventListener('playing', () => {
      if (this.source?.kind === 'audio') this.events.onState(1);
    });
    this.audio.addEventListener('pause', () => {
      if (this.source?.kind === 'audio' && this.audio.paused) this.events.onState(2);
    });
    this.audio.addEventListener('ended', () => {
      if (this.source?.kind === 'audio') this.events.onState(0);
    });
    this.audio.addEventListener('error', () => {
      if (this.source?.kind !== 'audio' || this.destroyed) return;
      this.events.onReady(false);
      this.events.onState(2);
      // A temporary connection failure is not evidence that a song is missing.
      // Reload on the next user gesture because play() alone retains MediaError.
      if (!this.audio.error || this.audio.error.code <= 2) {
        this.audioNeedsReload = true;
        this.events.onBlocked('The audio connection was interrupted. Check your connection and press Play to retry this song.');
        return;
      }
      this.events.onUnavailable('This audio file could not be loaded. Check that its Storage URL is accessible and contains a supported audio file.', this.source);
    });
  }

  loadSource(source: PlaybackSource, autoplay = true) {
    this.generation++;
    this.source = null;
    this.audio.pause();
    try { this.youtube?.pauseVideo(); } catch { /* A loading iframe can be paused later. */ }
    this.source = source;
    this.autoplay = autoplay;
    this.events.onReady(false);

    if (source.kind === 'audio') {
      this.audioNeedsReload = false;
      this.audio.src = source.url;
      this.audio.volume = this.volume / 100;
      this.audio.muted = this.muted;
      this.audio.load();
      if (autoplay) this.playVideo();
    } else if (this.youtubeReady && this.youtube && !this.youtubeNeedsReload) {
      this.loadYouTubeSource();
    } else {
      if (this.youtubeNeedsReload) this.resetYouTube();
      void this.ensureYouTube();
    }
  }

  private loadYouTubeSource() {
    if (this.source?.kind !== 'youtube' || !this.youtubeReady || !this.youtube) return;
    this.events.onReady(true);
    this.youtube.setVolume(this.volume);
    if (this.muted) this.youtube.mute();
    else this.youtube.unMute();
    if (this.autoplay) this.youtube.loadVideoById(this.source.videoId);
    else this.youtube.cueVideoById(this.source.videoId);
  }

  private async ensureYouTube() {
    if (this.youtubeLoading || this.destroyed) return;
    this.youtubeLoading = true;
    try {
      const YT = await loadYouTubeApi();
      if (this.destroyed || this.source?.kind !== 'youtube') {
        this.youtubeLoading = false;
        return;
      }
      this.container.replaceChildren();
      const mount = document.createElement('div');
      this.container.appendChild(mount);
      const attempt = ++this.youtubeAttempt;
      const isCurrentVideo = () => {
        if (this.destroyed || attempt !== this.youtubeAttempt || this.source?.kind !== 'youtube') return false;
        const videoId = this.youtube?.getVideoData?.().video_id;
        return !videoId || videoId === this.source.videoId;
      };
      this.youtubeReadyTimeout = window.setTimeout(() => {
        if (this.destroyed || attempt !== this.youtubeAttempt || this.youtubeReady) return;
        this.youtubeAttempt++;
        this.youtubeLoading = false;
        this.youtubeReadyTimeout = null;
        try { this.youtube?.destroy(); } catch { /* An incomplete iframe may not destroy cleanly. */ }
        this.youtube = null;
        if (this.source?.kind === 'youtube') {
          this.events.onReady(false);
          this.events.onState(2);
          this.events.onBlocked('The YouTube player did not respond. Check your connection and press Play to retry.');
        }
      }, 15000);
      this.youtube = new YT.Player(mount, {
        width: '100%', height: '200',
        playerVars: {
          autoplay: 0, controls: 1, enablejsapi: 1, playsinline: 1, rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (this.destroyed || attempt !== this.youtubeAttempt) return;
            if (this.youtubeReadyTimeout !== null) window.clearTimeout(this.youtubeReadyTimeout);
            this.youtubeReadyTimeout = null;
            this.youtubeReady = true;
            this.youtubeLoading = false;
            this.loadYouTubeSource();
          },
          onStateChange: (event: { data: number }) => {
            if (isCurrentVideo()) this.events.onState(event.data);
          },
          onAutoplayBlocked: () => {
            if (isCurrentVideo()) {
              this.events.onState(2);
              this.events.onBlocked('Your browser paused autoplay. Press Play again to start the music.');
            }
          },
          onError: (event: { data: number }) => {
            if (!isCurrentVideo() || this.source?.kind !== 'youtube') return;
            this.events.onReady(false);
            this.events.onState(2);
            if ([2, 100, 101, 150].includes(event.data)) {
              const reason = event.data === 2
                ? 'This track has an invalid YouTube video link.'
                : event.data === 100
                  ? 'This YouTube video was removed or made private.'
                  : 'This video’s owner does not allow playback in other websites.';
              this.events.onUnavailable(reason, this.source);
              return;
            }
            this.youtubeNeedsReload = true;
            this.events.onBlocked(event.data === 153
              ? 'YouTube could not verify this site. Press Play to reconnect, or open the song on YouTube.'
              : 'YouTube could not start the player. Press Play to reconnect and retry this song.');
          },
        },
      });
    } catch (error) {
      this.youtubeLoading = false;
      if (this.youtubeReadyTimeout !== null) window.clearTimeout(this.youtubeReadyTimeout);
      this.youtubeReadyTimeout = null;
      if (this.destroyed || this.source?.kind !== 'youtube') return;
      this.events.onState(2);
      this.events.onBlocked(error instanceof Error ? error.message : 'YouTube could not connect. Press Play to retry.');
    }
  }

  private resetYouTube() {
    this.youtubeAttempt++;
    if (this.youtubeReadyTimeout !== null) window.clearTimeout(this.youtubeReadyTimeout);
    this.youtubeReadyTimeout = null;
    this.youtubeReady = false;
    this.youtubeLoading = false;
    this.youtubeNeedsReload = false;
    try { this.youtube?.destroy(); } catch { /* A failed iframe may already be detached. */ }
    this.youtube = null;
  }

  playVideo() {
    this.autoplay = true;
    if (this.source?.kind === 'audio') {
      if (this.audioNeedsReload) {
        this.audioNeedsReload = false;
        this.audio.load();
      }
      const generation = this.generation;
      void this.audio.play().catch((error: DOMException) => {
        if (this.destroyed || generation !== this.generation || error.name === 'AbortError') return;
        this.events.onState(2);
        if (error.name === 'NotAllowedError') {
          this.events.onBlocked('Your browser paused autoplay. Press Play to start the music.');
        } else if (error.name === 'NotSupportedError' && this.source) {
          this.events.onUnavailable('This audio file could not be played. Check that the Storage URL is accessible.', this.source);
        } else {
          this.audioNeedsReload = true;
          this.events.onBlocked('The audio connection was interrupted. Press Play to retry this song.');
        }
      });
    } else if (this.youtubeNeedsReload) {
      this.resetYouTube();
      void this.ensureYouTube();
    } else if (this.youtubeReady) {
      this.youtube?.playVideo();
    } else {
      void this.ensureYouTube();
    }
  }

  pauseVideo() {
    this.autoplay = false;
    if (this.source?.kind === 'audio') this.audio.pause();
    else this.youtube?.pauseVideo();
  }

  getCurrentTime() { return this.source?.kind === 'audio' ? this.audio.currentTime : this.youtube?.getCurrentTime() ?? 0; }
  getDuration() { return this.source?.kind === 'audio' ? this.audio.duration : this.youtube?.getDuration() ?? 0; }
  seekTo(seconds: number) {
    if (this.source?.kind === 'audio') this.audio.currentTime = seconds;
    else this.youtube?.seekTo(seconds, true);
  }
  setVolume(volume: number) {
    this.volume = volume;
    this.audio.volume = volume / 100;
    if (this.youtubeReady) this.youtube?.setVolume(volume);
  }
  mute() { this.muted = true; this.audio.muted = true; if (this.youtubeReady) this.youtube?.mute(); }
  unMute() { this.muted = false; this.audio.muted = false; if (this.youtubeReady) this.youtube?.unMute(); }
  destroy() {
    this.destroyed = true;
    this.source = null;
    if (this.youtubeReadyTimeout !== null) window.clearTimeout(this.youtubeReadyTimeout);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.youtube?.destroy();
  }
}
