import type { SupabaseClient } from '@supabase/supabase-js';

export type SavedDownload = {
  id: number;
  song_id: number;
  title: string;
  artist: string;
  downloaded_at: string;
  audio_url?: string | null;
  cover_url?: string | null;
  mood?: string | null;
  duration?: number | null;
  genre?: string | null;
  language?: string | null;
  album_title?: string | null;
};

type Client = Pick<SupabaseClient, 'from'>;
type Relation<T> = T | T[] | null;
type DownloadRow = {
  id: number;
  song_id: number;
  downloaded_at: string;
  songs: Relation<{
    title: string;
    audio_url: string | null;
    cover_url: string | null;
    mood: string | null;
    duration: number | null;
    genre: string | null;
    language: string | null;
    artists: Relation<{ name: string }>;
    albums: Relation<{ title: string; cover_url: string | null }>;
  }>;
};

const selection = 'id,song_id,downloaded_at,songs(title,audio_url,cover_url,mood,duration,genre,language,artists(name),albums(title,cover_url))';
const relation = <T,>(value: Relation<T>): T | null => Array.isArray(value) ? value[0] ?? null : value;
const checkId = (id: number) => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Please sign in again before managing Downloads.');
};

export function mapSavedDownload(row: DownloadRow): SavedDownload {
  const song = relation(row.songs);
  const album = song ? relation(song.albums) : null;
  return {
    id: row.id, song_id: row.song_id, downloaded_at: row.downloaded_at,
    title: song?.title ?? 'Unavailable track',
    artist: song ? relation(song.artists)?.name ?? 'Unknown artist' : 'Unknown artist',
    audio_url: song?.audio_url ?? null,
    cover_url: song?.cover_url || album?.cover_url || null,
    mood: song?.mood ?? null, duration: song?.duration ?? null,
    genre: song?.genre ?? null, language: song?.language ?? null,
    album_title: album?.title ?? null,
  };
}

// The signed-in client's existing RLS enforces owner-only Premium access.
// These operations store catalog references; they never request media files.
export async function listSavedDownloads(client: Client, userId: number): Promise<SavedDownload[]> {
  checkId(userId);
  const { data, error } = await client.from('downloads').select(selection).eq('user_id', userId).order('downloaded_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as unknown as DownloadRow[] ?? []).map(mapSavedDownload);
}

export async function saveDownload(client: Client, userId: number, songId: number): Promise<SavedDownload> {
  checkId(userId); checkId(songId);
  const { data, error } = await client.from('downloads')
    .upsert({ user_id: userId, song_id: songId }, { onConflict: 'user_id,song_id' })
    .select(selection).single();
  if (error) throw new Error(error.message);
  return mapSavedDownload(data as unknown as DownloadRow);
}

export async function deleteSavedDownload(client: Client, userId: number, songId: number): Promise<void> {
  checkId(userId); checkId(songId);
  const { data, error } = await client.from('downloads').delete().eq('user_id', userId).eq('song_id', songId).select('song_id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Could not remove this song. Refresh the page and try again.');
}
