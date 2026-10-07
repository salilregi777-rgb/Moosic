import assert from 'node:assert/strict';
import test from 'node:test';
import { extractYouTubeVideoId, resolvePlaybackSource } from './playback-source.ts';

test('accepts watch, shortened, embedded, Shorts and live YouTube links', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
    'https://youtu.be/dQw4w9WgXcQ?si=shared',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ',
  ]) {
    assert.equal(extractYouTubeVideoId(url), 'dQw4w9WgXcQ');
    assert.equal(resolvePlaybackSource(url)?.kind, 'youtube');
  }
});

test('plays public and signed Supabase Storage audio without relying on an extension', () => {
  for (const url of [
    'https://project.supabase.co/storage/v1/object/public/music/track.mp3',
    'https://project.supabase.co/storage/v1/object/sign/music/track?token=abc',
    '/audio/local-track.ogg',
    'blob:https://moosic.example/recording',
  ]) assert.deepEqual(resolvePlaybackSource(url), { kind: 'audio', url, key: `audio:${url}` });
});

test('does not mistake arbitrary v or embed parameters for YouTube videos', () => {
  for (const url of [
    'https://storage.example/song.mp3?v=version',
    'https://notyoutube.com/embed/dQw4w9WgXcQ',
    'https://youtu.be.attacker.example/dQw4w9WgXcQ',
  ]) assert.equal(resolvePlaybackSource(url)?.kind, 'audio');
});

test('rejects missing videos, malformed IDs, unsafe protocols and text-only placeholders', () => {
  for (const url of [undefined, '', 'No URL', 'javascript:alert(1)', 'data:audio/mp3;base64,a',
    'https://youtube.com/watch', 'https://youtu.be/short', 'https://youtube.com/playlist?list=abc']) {
    assert.equal(resolvePlaybackSource(url), null);
  }
});
