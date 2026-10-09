export const NEXT_MOOD_SCROLL_SCREENS = 2.4;
export const NEXT_MOOD_COMMIT = .995;
export const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
// The recording's spatial keyframes, expressed as progress rather than elapsed time.
export const DISC_PROGRESS = [0, .2, .5, .8, 1];
export const DISC_Y = ['74svh', '68svh', '55svh', '38svh', '18svh'];
export const DISC_ROTATION = [24, 12, -24, -62, -86];
export const DISC_TILT = [48, 42, 28, 12, 0];
export const DISC_SCALE = [.82, .86, .94, 1.04, 1.08];
export function splitEditorialTitle(title: string): [string, string] {
  const words = title.trim().split(/\s+/);
  const split = Math.ceil(words.length / 2);
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')];
}
export function scrollTrackProgress(scrollTop: number, sectionTop: number, sectionHeight: number, viewportHeight: number) {
  return clampProgress((scrollTop - sectionTop) / Math.max(1, sectionHeight - viewportHeight));
}
