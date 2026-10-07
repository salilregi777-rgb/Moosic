export type PlaybackSource =
  | { kind: 'youtube'; videoId: string; key: string }
  | { kind: 'audio'; url: string; key: string };

export function resolvePlaybackSource(value?: string | null): PlaybackSource | null {
  const input = value?.trim();
  if (!input) return null;

  try {
    const url = new URL(input, 'https://moosic.local');
    if (!['http:', 'https:', 'blob:'].includes(url.protocol)) return null;

    const host = url.hostname.toLowerCase();
    const isShortLink = host === 'youtu.be' || host === 'www.youtu.be';
    const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com') ||
      host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');

    if (isShortLink || isYouTube) {
      const segments = url.pathname.split('/').filter(Boolean);
      const videoId = isShortLink
        ? segments[0]
        : ['embed', 'shorts', 'live', 'v'].includes(segments[0])
          ? segments[1]
          : url.searchParams.get('v');
      if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
      return { kind: 'youtube', videoId, key: `youtube:${videoId}` };
    }

    // Storage URLs may be signed or omit file extensions. Let the browser
    // inspect their content type instead of rejecting them by filename.
    if (url.hostname === 'moosic.local' && !input.startsWith('/')) return null;
    return { kind: 'audio', url: input, key: `audio:${input}` };
  } catch {
    return null;
  }
}

export function extractYouTubeVideoId(value?: string | null): string | null {
  const source = resolvePlaybackSource(value);
  return source?.kind === 'youtube' ? source.videoId : null;
}
