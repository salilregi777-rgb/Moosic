// The sequence is intentionally finite. Reorder here to change gallery and next-mood navigation.
export const MOOD_ORDER = ['Happy', 'Sad', 'Neutral', 'Angry', 'Exhausted'] as const;
export type GalleryMoodName = typeof MOOD_ORDER[number];
export function moodFromSlug(slug: string): GalleryMoodName | undefined {
  return MOOD_ORDER.find(name => name.toLowerCase() === slug.toLowerCase());
}
export function adjacentMood(name: GalleryMoodName, direction: number): GalleryMoodName | undefined {
  return MOOD_ORDER[MOOD_ORDER.indexOf(name) + direction];
}
export function durationMinutes(tracks: { duration: string }[]): number {
  return Math.round(tracks.reduce((sum, track) => {
    const parts = track.duration.split(':').map(Number);
    return sum + (parts.every(Number.isFinite) ? parts.reduce((seconds, part) => seconds * 60 + part, 0) : 0);
  }, 0) / 60);
}

export function durationLabel(tracks: { duration: string }[]): string {
  const minutes = durationMinutes(tracks);
  const incomplete = tracks.some(track => !/^\d+:\d{2}$/.test(track.duration));
  return minutes ? `${incomplete ? '' : 'About '}${minutes}${incomplete ? '+' : ''} min` : 'Duration unavailable';
}
