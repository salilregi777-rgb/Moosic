import { useState } from 'react';
import { Disc3 } from 'lucide-react';
import { extractYouTubeVideoId } from '@/lib/playback-source';

export type ArtworkTrack = { title: string; artist?: string; audioUrl?: string; coverUrl?: string };
const seedPlaceholderPaths = new Set([
  '/photo-1493225457124-a3eb161ffa5f',
  '/photo-1501386761578-eac5c94b800a',
  '/photo-1516280440614-37939bbacd81',
  '/photo-1524504388940-b1c1722653e1',
]);
function isSeedPlaceholder(cover: string): boolean {
  try {
    const url = new URL(cover);
    return url.hostname === 'images.unsplash.com' && seedPlaceholderPaths.has(url.pathname);
  } catch {
    return false;
  }
}

export function artworkSources(track: ArtworkTrack): string[] {
  const cover = track.coverUrl?.trim();
  const video = extractYouTubeVideoId(track.audioUrl);
  // Replace only the seed's unrelated stock photos; keep custom artwork intact.
  return [cover && !isSeedPlaceholder(cover) ? cover : null, video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : null].filter((url): url is string => Boolean(url));
}

function ArtworkImage({ track, sources, className }: { track: ArtworkTrack; sources: string[]; className: string }) {
  const [attempt, setAttempt] = useState(0);
  return <span className={`song-artwork ${className}`}>
    {sources[attempt] ? <img src={sources[attempt]} alt={`${track.title} cover`} loading="lazy" decoding="async" onError={() => setAttempt(index => index + 1)} /> : <span className="artwork-fallback" role="img" aria-label={`${track.title} — cover unavailable`}><Disc3 /><span>{track.title.slice(0, 1)}</span></span>}
  </span>;
}

export function SongArtwork({ track, className = '' }: { track: ArtworkTrack; className?: string }) {
  const sources = artworkSources(track);
  return <ArtworkImage key={sources.join('|') + track.title} track={track} sources={sources} className={className} />;
}
