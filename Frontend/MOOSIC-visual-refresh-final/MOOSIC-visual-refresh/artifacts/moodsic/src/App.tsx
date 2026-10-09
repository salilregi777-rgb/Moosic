import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Home as HomeIcon, ListMusic, Music2, Pause, Play, RotateCcw, Search, SkipBack, SkipForward, UserRound, X, Disc3, Pencil, Trash2, ArrowLeft, Shuffle, Volume2, VolumeX, Plus, Sparkles, Check, WandSparkles, Palette, LogOut, ArrowRight, Heart, Crown, LockKeyhole, Download, CreditCard } from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { flushSync } from 'react-dom';
import { SongArtwork, artworkSources } from '@/components/song-artwork';
import { MoodGalleryHome, MoodPlaylistPage, type PlaybackView, type GalleryPlayerControls, type MoodEdition } from '@/components/mood-experience';
import { MOOD_ORDER, moodFromSlug } from '@/lib/mood-navigation';
import { MoodDiscCarousel } from '@/components/mood-disc-carousel';
import { ThemeAtmosphere } from '@/components/theme-atmosphere';
import { themePalette, moodThemes, resolveRoomTheme } from '@/lib/themes';
import { ButtonGlow } from '@/components/button-glow';
import { AnimatedLogo } from '@/components/animated-logo';
import { SongAudioEditor } from '@/components/song-audio-editor';
import { PremiumCheckout } from '@/components/premium-checkout';
import { requireSupabase, supabase, supabaseConfigured, supabaseApiRequest } from '@/lib/supabase';
import { deleteSavedDownload, listSavedDownloads, saveDownload, type SavedDownload as BackendDownload } from '@/lib/downloads';
import loginBackdropAsset from '@assets/moodsic-references/login-backdrop.png';
import loadingFieldAsset from '@assets/moodsic-references/loading-field.png';
import cowRunnerAsset from '@assets/moodsic-references/cow-runner.png';
import sadMoodArt from '@assets/moodsic-references/mood-art-sad.png';
import happyMoodArt from '@assets/moodsic-references/mood-art-happy.png';
import neutralMoodArt from '@assets/moodsic-references/mood-art-neutral.png';
import exhaustedMoodArt from '@assets/moodsic-references/mood-art-exhausted.png';
import angryMoodArt from '@assets/moodsic-references/mood-art-angry.png';
import { ErrorBoundary } from '@/components/error-boundary';
import { MediaPlayer } from '@/lib/media-player';
import { resolvePlaybackSource, type PlaybackSource } from '@/lib/playback-source';

type MoodName = 'Sad' | 'Happy' | 'Neutral' | 'Exhausted' | 'Angry';
type Mood = { name: MoodName; color: string; background: string; text: string; line: string; description: string; art: string };
type Track = {
  id?: number;
  title: string;
  artist: string;
  duration: string;
  mood: MoodName;
  language?: string;
  genre?: string;
  audioUrl?: string;
  coverUrl?: string;
};

type BackendSong = {
  id: number;
  title: string;
  mood?: string | null;
  duration?: number | null;
  cover_url?: string | null;
  genre?: string | null;
  language?: string | null;
  audio_url?: string | null;
  is_playable?: boolean | null;
  artist_name?: string | null;
  artist?: { name?: string | null } | null;
};
type Playlist = {
  requestedTrackTitle?: string;
  id: string;
  name: string;
  mood: MoodName;
  count: number;
  description: string;
  trackTitles: string[];
  isCustom?: boolean;
  backendId?: number;
};

type BackendPlaylist = {
  id?: number;
  playlist_id?: number;
  name?: string;
  title?: string;
  description?: string | null;
  cover_url?: string | null;
  songs?: unknown[];
};

type AuthUser = { id: string; email: string; name: string; username: string; role?: string; profileNote?: string };
type ListeningStats = {
  month_label: string;
  year: number;
  total_seconds: number;
  hours_listened: number;
  records_visited: number;
  favorite_tracks: number;
  rotation: Record<MoodName, number>;
  member_since?: string | null;
};
type AuthSession = { user: AuthUser; token: string };
type PremiumStatus = {
  is_premium: boolean;
  plan?: string | null;
  status?: string | null;
  source?: 'manual' | 'purchase' | 'demo' | null;
  demo_premium?: boolean;
  can_cancel?: boolean;
  expires_at?: string | null;
  manual_premium?: boolean;
};

type ManagerDashboardData = {
  manager: { user_id: number; name: string; role: string };
  kpis: {
    total_users: number;
    premium_users: number;
    total_songs: number;
    total_artists: number;
    total_albums: number;
    successful_payments: number;
    total_revenue: number;
  };
};
type ManagerUser = { id: number; name: string; username: string; email: string; role: string; is_premium: boolean };
type ManagerPayment = { id: number; user_id: number; plan: string; amount: number; currency: string; status: string; payment_date: string };

type AuthMode = 'login' | 'signup';

const moods: Mood[] = [
  { name: 'Sad', color: '#829ece', background: '#080c14', text: '#d7d2c9', line: 'Let the blue stay awhile.', description: 'A soft landing for the feelings that have nowhere else to go.', art: sadMoodArt },
  { name: 'Happy', color: '#c3a074', background: '#120e09', text: '#d7d2c9', line: 'Put some light back in the room.', description: 'Bright edges, open windows, and a little more movement.', art: happyMoodArt },
  { name: 'Neutral', color: '#b49bcf', background: '#100b16', text: '#d7d2c9', line: 'A blank page with a pulse.', description: 'A considered middle ground for thinking, making, and drifting.', art: neutralMoodArt },
  { name: 'Exhausted', color: '#7fb9ac', background: '#080f0e', text: '#d7d2c9', line: 'Nothing to prove tonight.', description: 'Low lamps and slow songs for coming back to yourself.', art: exhaustedMoodArt },
  { name: 'Angry', color: '#c18779', background: '#120b0b', text: '#d7d2c9', line: 'Turn it up. Let it out.', description: 'A loud, honest room for the heat under your skin.', art: angryMoodArt },
];

const fallbackTracks: Track[] = [
  { title: 'Cake By The Ocean', artist: 'DNCE', duration: '3:39', mood: 'Happy' },
  { title: 'Electric Love', artist: 'BORNS', duration: '3:38', mood: 'Happy' },
  { title: 'Someone To You', artist: 'Banners', duration: '3:39', mood: 'Happy' },
  { title: 'Wake Me Up', artist: 'Avicii', duration: '4:07', mood: 'Happy' },
  { title: 'Circles', artist: 'Post Malone', duration: '3:35', mood: 'Happy' },
  { title: 'SuperMarket Flowers', artist: 'Ed Sheeran', duration: '3:41', mood: 'Sad' },
  { title: 'Funeral', artist: 'Band of Horses', duration: '3:55', mood: 'Sad' },
  { title: 'The Scientist', artist: 'Coldplay', duration: '5:09', mood: 'Sad' },
  { title: 'Six Feet Under', artist: 'Billie Eillish', duration: '3:09', mood: 'Sad' },
  { title: 'Cherry Wine', artist: 'Hozier', duration: '4:00', mood: 'Sad' },
  { title: 'Fake Plastic Trees', artist: 'Radiohead', duration: '4:50', mood: 'Neutral' },
  { title: 'Shallow', artist: 'Lady Gaga, Bradley Cooper', duration: '3:36', mood: 'Neutral' },
  { title: 'Holocene', artist: 'Bon Iver', duration: '5:36', mood: 'Neutral' },
  { title: 'Another Love', artist: 'Tom Odell', duration: '4:04', mood: 'Neutral' },
  { title: 'Orbiter', artist: 'Noah Kahan', duration: '3:41', mood: 'Neutral' },
  { title: 'Dancing With Your Ghost', artist: 'Sasha Alex Sloan', duration: '3:18', mood: 'Exhausted' },
  { title: 'You And Me', artist: 'Lifehouse', duration: '3:15', mood: 'Exhausted' },
  { title: 'Falling Like The Stars', artist: 'James Arthur', duration: '3:32', mood: 'Exhausted' },
  { title: 'Scarecrow', artist: 'Alex and Sierra', duration: '3:13', mood: 'Exhausted' },
  { title: 'Visions of Gideon', artist: 'Sufjan Stevens', duration: '3:34', mood: 'Exhausted' },
  { title: '21 Guns', artist: 'Green Day', duration: '5:21', mood: 'Angry' },
  { title: '9 to 5', artist: 'Dolly Parton', duration: '2:43', mood: 'Angry' },
  { title: 'Take Me Home, Country Roads', artist: 'John Denver', duration: '3:10', mood: 'Angry' },
  { title: 'The Zephyr Song', artist: 'Red Hot Chili Peppers', duration: '3:52', mood: 'Angry' },
  { title: 'Wonderwall', artist: 'Oasis', duration: '4:18', mood: 'Angry' },
  { title: 'Subhanallah', artist: 'Vishal Dadlani, Shekhar Ravjiani', duration: '4:09', mood: 'Happy' },
  { title: 'Tum Hi Ho', artist: 'Arijit Singh', duration: '4:22', mood: 'Happy' },
  { title: 'Bandhu', artist: 'Kailash Kher', duration: '4:36', mood: 'Happy' },
  { title: 'Uff Teri Adaa', artist: 'Shankar Mahadevan, Alyssa Mendonsa', duration: '5:04', mood: 'Happy' },
  { title: 'Dil Dhadakne Do', artist: 'Priyanka Chopra, Farhan Akhtar', duration: '3:50', mood: 'Happy' },
  { title: 'Phir Kabhi', artist: 'Arijit Singh', duration: '4:48', mood: 'Sad' },
  { title: 'Choo Lo', artist: 'The Local Train', duration: '3:53', mood: 'Sad' },
  { title: 'Jeena Jeena', artist: 'Atif Aslam', duration: '3:48', mood: 'Sad' },
  { title: 'Aaoge Jab Tum', artist: 'Rashid Khan', duration: '5:55', mood: 'Sad' },
  { title: 'Barsaat', artist: 'Rochak Kohli, Sonu Nigam', duration: '4:12', mood: 'Sad' },
  { title: 'Mere Bina', artist: 'Nikhil D’Souza', duration: '4:49', mood: 'Neutral' },
  { title: 'Soch Na Sake', artist: 'Arijit Singh, Tulsi Kumar', duration: '4:41', mood: 'Neutral' },
  { title: 'Tum Ho Toh', artist: 'Farhan Akhtar', duration: '3:58', mood: 'Neutral' },
  { title: 'Kasoor', artist: 'Prateek Kuhad', duration: '3:17', mood: 'Neutral' },
  { title: 'Kaisi Hai Ye Rut', artist: 'Srinivas', duration: '5:27', mood: 'Neutral' },
  { title: 'Tum Se Hi', artist: 'Mohit Chauhan', duration: '5:21', mood: 'Exhausted' },
  { title: 'Safarnama', artist: 'Lucky Ali', duration: '4:11', mood: 'Exhausted' },
  { title: 'Jaane Woh Kaise Log The', artist: 'Hemant Kumar', duration: '4:05', mood: 'Exhausted' },
  { title: 'Kun Faya Kun', artist: 'A.R. Rahman, Javed Ali, Mohit Chauhan', duration: '7:53', mood: 'Exhausted' },
  { title: 'Bekhayali', artist: 'Sachet Tandon', duration: '6:11', mood: 'Exhausted' },
  { title: 'Sadda Haq', artist: 'Mohit Chauhan', duration: '6:05', mood: 'Angry' },
  { title: 'Udta Punjab', artist: 'Amit Trivedi', duration: '4:17', mood: 'Angry' },
  { title: 'Rock On!!', artist: 'Farhan Akhtar', duration: '3:54', mood: 'Angry' },
  { title: 'Zinda', artist: 'Siddharth Mahadevan', duration: '3:31', mood: 'Angry' },
  { title: 'Khoon Mein Teri Mitti', artist: 'B Praak', duration: '5:10', mood: 'Angry' },
];

const playlistBlueprints = [
  { id: 'p1', name: 'Blue Hour', mood: 'Sad' as MoodName, language: 'non-hindi', description: 'For the quiet parts of the evening.' },
  { id: 'p1-hindi', name: 'Monsoon Letters', mood: 'Sad' as MoodName, language: 'Hindi', description: 'Hindi songs for the softer ache.' },
  { id: 'p2', name: 'Windows Down', mood: 'Happy' as MoodName, language: 'non-hindi', description: 'A little sunlight, pressed to vinyl.' },
  { id: 'p2-hindi', name: 'Desi Daydream', mood: 'Happy' as MoodName, language: 'Hindi', description: 'Hindi songs for the bright side.' },
  { id: 'p3', name: 'The Middle Distance', mood: 'Neutral' as MoodName, language: 'non-hindi', description: 'Focus without the fuss.' },
  { id: 'p3-hindi', name: 'Soft Focus', mood: 'Neutral' as MoodName, language: 'Hindi', description: 'Hindi songs for an easy middle ground.' },
  { id: 'p4', name: 'Low Battery', mood: 'Exhausted' as MoodName, language: 'all', description: 'Soft sounds for a soft landing.' },
  { id: 'p4-hindi', name: 'Sukoon Station', mood: 'Exhausted' as MoodName, language: 'Hindi', description: 'Hindi songs for the slow comedown.' },
  { id: 'p5', name: 'Loudly, Please', mood: 'Angry' as MoodName, language: 'non-hindi', description: 'Pressure, released.' },
  { id: 'p5-hindi', name: 'Gussa FM', mood: 'Angry' as MoodName, language: 'Hindi', description: 'Hindi songs for the fire in your chest.' },
];



function isMoodName(value: string | null | undefined): value is MoodName {
  return value === 'Sad' || value === 'Happy' || value === 'Neutral' || value === 'Exhausted' || value === 'Angry';
}

function inferMood(song: BackendSong): MoodName {
  if (isMoodName(song.mood)) return song.mood;

  const genre = (song.genre ?? '').toLowerCase();

  if (/(ballad|romance|r&b|soul)/.test(genre)) return 'Sad';
  if (/(hip hop|dancehall|alternative rock)/.test(genre)) return 'Angry';
  if (/(classical|ambient|acoustic)/.test(genre)) return 'Exhausted';
  if (/(synthwave|indie pop|electropop|pop rock)/.test(genre)) return 'Neutral';
  if (/(dance pop|house|funk|latin pop|dance|pop)/.test(genre)) return 'Happy';

  return 'Neutral';
}

function formatDuration(totalSeconds?: number | null) {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return '--:--';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}


function parseDuration(value: string) {
  if (!value || value === '--:--') return 0;
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function backendSongToTrack(song: BackendSong): Track {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist_name || song.artist?.name || 'Unknown artist',
    duration: formatDuration(song.duration),
    mood: inferMood(song),
    language: song.language ?? undefined,
    genre: song.genre ?? undefined,
    audioUrl: song.audio_url ?? undefined,
    coverUrl: song.cover_url ?? undefined,
  };
}


function buildDefaultPlaylists(catalog: Track[]): Playlist[] {
  return playlistBlueprints.map((blueprint) => {
    const moodTracks = catalog.filter((track) => track.mood === blueprint.mood);
    const sideTracks = moodTracks.filter((track) =>
      blueprint.language === 'all' ? true : blueprint.language === 'Hindi'
        ? track.language?.toLowerCase() === 'hindi'
        : track.language?.toLowerCase() !== 'hindi'
    );

    // If a language side happens to be empty, use the mood catalogue rather than
    // rendering a playlist that cannot be opened.
    const selectedTracks = sideTracks.length > 0 ? sideTracks : moodTracks;
    // Keep the existing Hindi track after the new Low Battery selections.
    if (blueprint.id === 'p4') {
      selectedTracks.sort((a, b) => Number(a.language?.toLowerCase() === 'hindi') - Number(b.language?.toLowerCase() === 'hindi'));
    }

    return {
      id: blueprint.id,
      name: blueprint.name,
      mood: blueprint.mood,
      count: selectedTracks.length,
      trackTitles: selectedTracks.map((track) => track.title),
      description: blueprint.description,
    };
  });
}

const fallbackPlaylists = buildDefaultPlaylists(fallbackTracks);

export function moodFor(name: MoodName) {
  return moods.find((mood) => mood.name === name) ?? moods[2];
}

function moodStyle(mood: Mood): CSSProperties {
  return { '--mood': `var(--app-accent, ${mood.color})`, '--mood-bg': mood.background, '--mood-text': '#d7d2c9' } as CSSProperties;
}

function avatarInitial(user: AuthUser | null) {
  return user?.username?.trim().charAt(0).toUpperCase() || user?.name?.trim().charAt(0).toUpperCase() || '?';
}

const AUTH_STORAGE_KEY = 'moodsic-auth-session';
const LEGACY_DEMO_USER_KEY = 'moodsic-demo-user';

function normalizeBackendUser(raw: unknown): AuthUser {
  const user = (raw ?? {}) as {
    user_id?: number | string;
    id?: number | string;
    email?: string;
    name?: string;
    username?: string;
    role?: string;
    profile_note?: string | null;
  };

  const id = user.user_id ?? user.id;

  if (
    id == null ||
    !user.email ||
    !user.name ||
    !user.username
  ) {
    throw new Error('The backend returned an invalid user record.');
  }

  return {
    id: String(id),
    email: user.email,
    name: user.name,
    username: user.username,
    role: user.role,
    profileNote: user.profile_note ?? '',
  };
}

// Supabase owns session persistence and refresh. This cache holds only the
// currently rendered profile/session; legacy hand-rolled tokens are discarded.
let activeAuthSession: AuthSession | null = null;
function readAuthSession() { return activeAuthSession; }
function storeAuthSession(session: AuthSession) { activeAuthSession = session; }
function clearAuthSession() {
  activeAuthSession = null;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_DEMO_USER_KEY);
}

async function postAuth(path: '/users' | '/login', body: Record<string, string>) {
  const client = requireSupabase();
  if (path === '/users') {
    const { data, error } = await client.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { name: body.name, username: body.username },
        emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
      },
    });
    if (error) throw error;
    return { requiresConfirmation: !data.session };
  }
  const { error } = await client.auth.signInWithPassword({ email: body.email, password: body.password });
  if (error) throw error;
  return { requiresConfirmation: false };
}

async function restoreAuthSession(): Promise<AuthSession | null> {
  const { data: { session }, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  if (!session) return null;
  const user = normalizeBackendUser(await supabaseApiRequest('/me'));
  const restored = { user, token: session.access_token };
  storeAuthSession(restored);
  return restored;
}

async function loginWithBackend(email: string, password: string): Promise<AuthSession> {
  await postAuth('/login', { email: email.trim().toLowerCase(), password });
  const session = await restoreAuthSession();
  if (!session) throw new Error('Please confirm your email before signing in.');
  return session;
}

function getAuthenticatedSession() {
  if (!activeAuthSession) throw new Error('Your session has expired. Please sign in again.');
  return activeAuthSession;
}

const apiRequest = supabaseApiRequest;

function unwrapArray(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

function backendPlaylistId(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const nested =
    record.playlist && typeof record.playlist === 'object'
      ? record.playlist as Record<string, unknown>
      : null;

  const value =
    record.id ??
    record.playlist_id ??
    nested?.id ??
    nested?.playlist_id;

  const id = Number(value);

  return Number.isFinite(id) && id > 0
    ? id
    : null;
}

function encodePlaylistDescription(
  description: string,
  mood: MoodName
) {
  return `[[MOOSIC_MOOD:${mood}]] ${description}`.trim();
}

function decodePlaylistDescription(
  rawDescription: unknown,
  fallbackMood: MoodName
) {
  const description =
    typeof rawDescription === 'string'
      ? rawDescription
      : '';

  const match = description.match(
    /^\[\[MOOSIC_MOOD:(Sad|Happy|Neutral|Exhausted|Angry)\]\]\s*/
  );

  const mood =
    match && isMoodName(match[1])
      ? match[1]
      : fallbackMood;

  return {
    mood,
    description: description
      .replace(
        /^\[\[MOOSIC_MOOD:(Sad|Happy|Neutral|Exhausted|Angry)\]\]\s*/,
        ''
      )
      .trim(),
  };
}

function inferPlaylistMoodFromTracks(
  tracks: Track[]
): MoodName {
  if (tracks.length === 0) {
    return 'Neutral';
  }

  const counts = new Map<MoodName, number>();

  for (const track of tracks) {
    counts.set(
      track.mood,
      (counts.get(track.mood) ?? 0) + 1
    );
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Neutral';
}

function playlistTracksFromPayload(
  payload: unknown,
  catalog: Track[]
) {
  const items = unwrapArray(
    payload,
    ['songs', 'items', 'results', 'data']
  );

  const resolved: Track[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const wrapper = item as Record<string, unknown>;
    const nestedSong =
      wrapper.song && typeof wrapper.song === 'object'
        ? wrapper.song as Record<string, unknown>
        : wrapper;

    const rawId =
      nestedSong.id ??
      nestedSong.song_id ??
      wrapper.song_id;

    const songId = Number(rawId);

    let track =
      Number.isFinite(songId)
        ? catalog.find((candidate) => candidate.id === songId)
        : undefined;

    if (!track) {
      const title =
        typeof nestedSong.title === 'string'
          ? nestedSong.title
          : null;

      if (title) {
        track = catalog.find(
          (candidate) =>
            candidate.title.toLowerCase() ===
            title.toLowerCase()
        );
      }
    }

    if (track && !resolved.some((candidate) => candidate.id === track?.id && candidate.title === track?.title)) {
      resolved.push(track);
    }
  }

  return resolved;
}

async function backendPlaylistToPlaylist(
  raw: unknown,
  catalog: Track[]
): Promise<Playlist | null> {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const nested =
    record.playlist && typeof record.playlist === 'object'
      ? record.playlist as Record<string, unknown>
      : record;

  const id = backendPlaylistId(raw);

  if (!id) {
    return null;
  }

  const nameValue =
    nested.name ??
    nested.title ??
    record.name ??
    record.title;

  const name =
    typeof nameValue === 'string' && nameValue.trim()
      ? nameValue.trim()
      : `Playlist ${id}`;

  let playlistTracks: Track[] = [];

  try {
    const songsPayload = await apiRequest(
      `/playlists/${id}/songs`
    );

    playlistTracks = playlistTracksFromPayload(
      songsPayload,
      catalog
    );
  } catch (error) {
    console.error(
      `Failed to load songs for playlist ${id}:`,
      error
    );
  }

  const fallbackMood =
    inferPlaylistMoodFromTracks(playlistTracks);

  const decoded = decodePlaylistDescription(
    nested.description ?? record.description,
    fallbackMood
  );

  return {
    id: String(id),
    backendId: id,
    name,
    mood: decoded.mood,
    count: playlistTracks.length,
    description:
      decoded.description ||
      `A ${decoded.mood.toLowerCase()} room, made by you.`,
    trackTitles: playlistTracks.map(
      (track) => track.title
    ),
    isCustom: true,
  };
}

async function fetchUserPlaylists(
  userId: number,
  catalog: Track[],
  recycleBin = false
) {
  const suffix = recycleBin
    ? '/recycle-bin'
    : '';

  const payload = await apiRequest(
    `/users/${userId}/playlists${suffix}`
  );

  const rawPlaylists = unwrapArray(
    payload,
    ['playlists', 'items', 'results', 'data']
  );

  const playlists = await Promise.all(
    rawPlaylists.map((raw) =>
      backendPlaylistToPlaylist(raw, catalog)
    )
  );

  return playlists.filter(
    (playlist): playlist is Playlist =>
      playlist !== null
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen" style={{ '--loading-field': `url(${loadingFieldAsset})` } as CSSProperties}>
      <div className="loading-haze" />
      <div className="loading-center" role="status" aria-live="polite">
        <div className="cow-spinner" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <img
              key={index}
              className="cow-runner"
              src={cowRunnerAsset}
              alt=""
              style={{ '--orbit-index': index } as CSSProperties}
            />
          ))}
        </div>
        <span>finding your room</span>
      </div>
    </main>
  );
}

function AuthPage({ mode, setMode, onAuthenticated, connectionError }: { mode: AuthMode; setMode: (mode: AuthMode) => void; onAuthenticated: (user: AuthUser) => void; connectionError?: string }) {
  const isSignup = mode === 'signup';
  const [form, setForm] = useState({ email: '', name: '', username: '', password: '' });
  const [message, setMessage] = useState(connectionError || (!supabaseConfigured ? 'Moosic is waiting for its Supabase connection. Finish project setup to sign in.' : ''));
  useEffect(() => { if (connectionError) setMessage(connectionError); }, [connectionError]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage('');
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSignup && form.password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');

    try {
      const email = form.email.trim().toLowerCase();
      const password = form.password;

      if (isSignup) {
        const registration = await postAuth('/users', {
          name: form.name.trim(),
          username: form.username.trim(),
          email,
          password,
        });
        if (registration.requiresConfirmation) {
          setMessage('Check your email to confirm your account, then sign in.');
          setMode('login');
          return;
        }
      }

      const session = await loginWithBackend(email, password);

      storeAuthSession(session);
      onAuthenticated(session.user);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-screen" style={{ '--auth-backdrop': `url(${loginBackdropAsset})` } as CSSProperties}>
      <section className="auth-panel" aria-label={isSignup ? 'Create your MOOSIC account' : 'Log in to MOOSIC'}>
        <div className="auth-art" style={{ backgroundImage: `url(${loadingFieldAsset})` }} aria-hidden="true" />
        <div className="auth-form-side">
          <button className="auth-back" type="button" onClick={() => setMode('login')} disabled={!isSignup}>← Back</button>
          <div className="auth-heading">
            <span>{isSignup ? 'Sign up to' : 'Login to'}</span>
            <div className="auth-brand">
              <AnimatedLogo testId="img-auth-logo" />
              <h1>MOOSIC</h1>
            </div>
          </div>
          <form onSubmit={submit} className="auth-form">
            {isSignup && (
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  autoComplete="name"
                  placeholder="Your name"
                  required
                />
              </label>
            )}
            {isSignup && (
              <label>
                Username
                <input
                  value={form.username}
                  onChange={(event) => updateField('username', event.target.value)}
                  autoComplete="username"
                  placeholder="Choose a username"
                  required
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => updateField('email', event.target.value)}
                autoComplete="email"
                placeholder="Enter email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={form.password}
                onChange={(event) => updateField('password', event.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? 'At least 8 characters' : 'Enter password'}
                minLength={isSignup ? 8 : 1}
                required
              />
            </label>
            {message && <p className="auth-message" role="alert">{message}</p>}
            <button className="auth-submit" type="submit" disabled={isSubmitting || !supabaseConfigured}>
              {isSubmitting
                ? (isSignup ? 'Creating your account…' : 'Signing you in…')
                : isSignup
                  ? 'Create account'
                  : 'Enter MOOSIC'}
            </button>
          </form>
          <p className="auth-switch">
            {isSignup ? 'Already have an account?' : 'Don’t have an account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(isSignup ? 'login' : 'signup');
                setMessage('');
              }}
            >
              {isSignup ? 'Log in' : 'Sign up'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}

function AuthGate({
  authUser,
  setAuthUser,
  authMode,
  setAuthMode,
  children,
}: {
  authUser: AuthUser | null;
  setAuthUser: (user: AuthUser | null) => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<'checking' | 'ready'>(
    authUser ? 'ready' : 'checking'
  );
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    let active = true;
    let revision = 0;
    const restore = async () => {
      const request = ++revision;
      try {
        const session = await restoreAuthSession();
        if (active && request === revision) {
          setAuthUser(session?.user ?? null);
          setConnectionError('');
        }
      } catch (error) {
        if (active && request === revision) setConnectionError(error instanceof Error ? error.message : 'Could not restore your session.');
      } finally {
        if (active) setState('ready');
      }
    };
    clearAuthSession();
    if (!supabase) { setState('ready'); return; }
    void restore();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        revision++;
        clearAuthSession();
        if (active) setAuthUser(null);
      } else if (event === 'TOKEN_REFRESHED' && session && activeAuthSession) {
        storeAuthSession({ ...activeAuthSession, token: session.access_token });
      } else if (event === 'SIGNED_IN') {
        // Do not await other auth methods inside the SDK's auth lock.
        window.setTimeout(() => { if (active) void restore(); }, 0);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [setAuthUser]);

  if (state === 'checking') {
    return <LoadingScreen />;
  }

  if (!authUser) {
    return (
      <AuthPage
        mode={authMode}
        setMode={setAuthMode}
        onAuthenticated={setAuthUser}
        connectionError={connectionError}
      />
    );
  }

  return <>{children}</>;
}

function Brand() {
  return (
    <Link href="/" className="brand-lockup" data-testid="link-brand">
      <AnimatedLogo testId="img-brand-logo" />
      <span><span className="brand-name">MOOSIC</span></span>
    </Link>
  );
}

function Navigation({ mobile = false, authUser }: { mobile?: boolean; authUser?: AuthUser | null }) {
  const [location] = useLocation();
  const items = [
    { href: '/home', label: 'Now playing', icon: HomeIcon },
    { href: '/playlists', label: 'My playlists', icon: ListMusic },
    { href: '/restore', label: 'Restore', icon: RotateCcw },
    { href: '/search', label: 'Search', icon: Search },
    { href: '/downloads', label: 'Downloads', icon: Download },
    { href: '/theme', label: 'Custom Theme', icon: Palette },
    { href: '/premium', label: 'Premium', icon: Crown },
    { href: '/profile', label: 'Profile', icon: UserRound },
    ...(authUser?.role === 'manager' ? [{ href: '/manager', label: 'Manager', icon: Crown }] : []),
  ];
  return (
    <nav className={mobile ? 'mobile-nav' : 'nav-stack'} aria-label="Main navigation">
      {!mobile && <p className="nav-label">Browse</p>}
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={`nav-link ${mobile ? '' : ''} ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`}>
          <Icon />
          <span>{mobile ? label.split(' ')[0] : label}</span>
        </Link>
      ))}
    </nav>
  );
}

export function Shell({ children, authUser, appBackground, isPremium }: { children: ReactNode; authUser: AuthUser; appBackground?: string; isPremium: boolean }) {
  const [location] = useLocation();
  const isPicker = location === '/' || location.startsWith('/mood/');
  const roomTheme = resolveRoomTheme(appBackground);
  return (
    <div className={`moodsic-app ${isPicker ? 'moodsic-app--picker moodsic-app--gallery' : ''}`} style={{ '--app-background': roomTheme.background, '--app-foreground': '#d7d2c9', '--app-accent': roomTheme.accent, '--muted-ink': '#a6a1ad' } as CSSProperties}>
      <ThemeAtmosphere theme={roomTheme} />
      <div className="shell-grid">
        <aside className={`side-rail ${isPicker ? 'picker-hidden-rail' : ''}`}>
          <Brand />
          <Navigation authUser={authUser} />
          <div className="rail-note"><strong>Tonight's note</strong>Music works better when you tell it the truth.</div>
        </aside>
        <main className="main-column">
          {isPicker ? (
            <header className="picker-topbar">
              <Link href="/" className="picker-brand" data-testid="link-picker-brand">
                <AnimatedLogo />
                <span>MOOSIC</span>
              </Link>
              <nav className="picker-nav" aria-label="MOOSIC navigation">
                <Link href="/" className="picker-nav-active">Moosic</Link>
                <Link href="/search">Discover</Link>
                <Link href="/playlists">Your library</Link>
              </nav>
              <Link href="/search" className="gallery-search">Search</Link>
              <Link href="/profile" className="picker-profile" title={`@${authUser.username}`} data-testid="link-picker-profile">{avatarInitial(authUser)}</Link>
            </header>
          ) : (
            <header className="topbar">
              <span className="topbar-title">Listening in <b>{location === '/home' ? 'the mood room' : location.slice(1)}</b></span>
              <div className="topbar-actions">
                <Link
                  href="/premium"
                  data-testid="link-plan-status"
                  style={{
                    border: `1px solid ${isPremium ? roomTheme.accent : '#575866'}`,
                    color: isPremium ? roomTheme.accent : '#c7c1c9',
                    borderRadius: 999,
                    padding: '8px 14px',
                    fontSize: 10,
                    letterSpacing: '.13em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    background: isPremium ? `${roomTheme.accent}14` : 'rgba(255,255,255,.025)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isPremium ? 'Premium' : 'Free Plan'}
                </Link>
                <button className="icon-button" onClick={() => window.history.back()} aria-label="Go back" data-testid="button-go-back"><ArrowLeft size={16} /></button>
                <Link href="/profile" className="mini-avatar" title={`@${authUser.username}`} data-testid="link-avatar">{avatarInitial(authUser)}</Link>
              </div>
            </header>
          )}
          {children}
        </main>
      </div>
      <Navigation mobile authUser={authUser} />
    </div>
  );
}

export function MoodPicker({ selectMood, activeMood, previewMood }: { selectMood: (name: MoodName) => void; activeMood: MoodName; previewMood: (name: MoodName) => void }) {
  const active = Math.max(0, moods.findIndex(mood => mood.name === activeMood));
  const mood = moods[active];
  const browse = (direction: number) => previewMood(moods[(active + direction + moods.length) % moods.length].name);
  return <section className="page mood-gallery" aria-label="Choose your mood">
    <div className="gallery-heading">
      <div><span className="eyebrow">A record for every version of you</span><h1>Your mood.<br /><em>On repeat.</em></h1></div>
      <p>Take a breath. Find your frequency.<br />There’s a room for how you feel.</p>
    </div>
    <MoodDiscCarousel discs={moods.map(item => ({ ...item, subtitle: moodThemes[item.name].name }))} active={active} onPreview={index => previewMood(moods[index].name)} onSelect={index => selectMood(moods[index].name)} />
    <div className="gallery-caption">
      <div className="gallery-counter"><span>{String(active + 1).padStart(2, '0')}</span><span>/ 05</span></div>
      <div className="gallery-mood-copy" aria-live="polite" aria-atomic="true"><div key={mood.name} className="gallery-copy-content"><h2>{mood.name}</h2><p>{mood.description}</p></div></div>
      <button className="solid-button gallery-enter" onClick={() => selectMood(mood.name)}>Enter this mood <ArrowRight size={16} /></button>
    </div>
    <div className="gallery-footer"><span>SCROLL / DRAG / ARROWS / SPACE TO FLIP</span><div className="gallery-controls"><button className="icon-button" onClick={() => browse(-1)} aria-label="Previous mood"><ArrowLeft size={18} /></button><div className="gallery-dots">{moods.map(item => <button key={item.name} className={item.name === mood.name ? 'selected' : ''} onClick={() => previewMood(item.name)} aria-label={`Browse ${item.name} mood`} aria-pressed={item.name === mood.name} />)}</div><button className="icon-button" onClick={() => browse(1)} aria-label="Next mood"><ArrowRight size={18} /></button></div><span>MADE FOR YOUR CURRENT SELF</span></div>
  </section>;
}

function PlaylistChoicePage({ moodName, library, choosePlaylist }: { moodName: MoodName; library: Playlist[]; choosePlaylist: (playlist: Playlist) => void }) {
  const mood = moodFor(moodName);
  const choices = library.filter((playlist) => playlist.mood === moodName);
  return (
    <section className="page playlist-choice-page" style={moodStyle(mood)}>
      <button className="back-link animate-rise" type="button" onClick={() => window.history.back()}><ArrowLeft size={15} /> Back to moods</button>
      <div className="playlist-choice-heading animate-rise-2">
        <div className="eyebrow">Two sides of the same feeling / {moodName}</div>
        <h1>Pick your<br /><em>playlist.</em></h1>
        <p>Same mood, different flavor. Choose the room you want to step into.</p>
      </div>
      <div className="playlist-choice-grid animate-rise-3">
        {choices.map((playlist, index) => (
          <button key={playlist.id} className="playlist-choice-card" onClick={() => choosePlaylist(playlist)} style={moodStyle(mood)} data-testid={`button-playlist-choice-${playlist.id}`}>
            <span className="choice-number">0{index + 1}</span>
            <span className="choice-disc" aria-hidden="true"><Disc3 size={46} strokeWidth={1} /></span>
            <span className="choice-copy">
              <strong>{playlist.name}</strong>
              <small>{playlist.description}</small>
              <span className="choice-meta">{playlist.trackTitles.length} tracks <ArrowRight size={14} /></span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function RecordCover({ mood, track, isPlaying = false }: { mood: Mood; track: Track; isPlaying?: boolean }) {
  return <div className={`record-stage ${isPlaying ? 'is-playing' : ''}`} style={moodStyle(mood)} aria-label={`${track.title} CD player — ${isPlaying ? 'playing' : 'paused'}`}>
    <div className="deck-topline"><span>MOOSIC / DISC 01</span><span className="deck-status">{isPlaying ? 'PLAYING' : 'STANDBY'}</span></div>
    <div className="record-shadow" /><div className="vinyl" data-testid="playing-disc" style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}><SongArtwork track={track} className="disc-artwork" /><div className="disc-hub" /><div className="disc-rim" /></div>
    <div className="tone-arm"><span className="needle" /></div><div className="deck-bottomline"><span className={`deck-led ${isPlaying ? 'on' : ''}`} /><span>{isPlaying ? 'Let the record turn.' : 'A moment between songs.'}</span><span>33⅓</span></div>
  </div>;
}


function HomePage({
  selectedMood,
  selectedPlaylist,
  setNotice,
  tracks,
  userId,
  compact = false,
  isPremium,
  downloadedSongIds,
  onDownload,
  onPlaybackView,
  galleryControls,
}: {
  selectedMood: MoodName;
  selectedPlaylist: Playlist | null;
  setNotice: (notice: string) => void;
  tracks: Track[];
  userId: number;
  compact?: boolean;
  isPremium: boolean;
  downloadedSongIds: Set<number>;
  onDownload: (track: Track) => Promise<void> | void;
  onPlaybackView: (view: PlaybackView) => void;
  galleryControls: { current: GalleryPlayerControls | null };
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playerStarted, setPlayerStarted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [seekPreviewSeconds, setSeekPreviewSeconds] = useState<number | null>(null);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [likedSongIds, setLikedSongIds] = useState<Set<number>>(new Set());

  // Playback is independent from the room currently being browsed.
  const [activeQueue, setActiveQueue] = useState<Track[]>([]);
  const [activeMoodName, setActiveMoodName] = useState<MoodName>(selectedMood);
  const [activeRoomName, setActiveRoomName] = useState('Mood mix');

  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const mediaPlayerRef = useRef<MediaPlayer | null>(null);
  const playerReadyRef = useRef(false);
  const currentTrackRef = useRef<Track | null>(null);
  const playerTracksRef = useRef<Track[]>([]);
  const trackIndexRef = useRef(0);
  const shuffleEnabledRef = useRef(false);
  const isPlayingRef = useRef(false);
  const playerErrorHandlerRef = useRef<(message: string, source: PlaybackSource) => void>(() => {});
  const playerNoticeRef = useRef(setNotice);
  playerNoticeRef.current = setNotice;
  const playerStateHandlerRef = useRef<(state: number) => void>(() => {});
  const advanceTrackRef = useRef<(direction: 1 | -1, automatic?: boolean) => void>(() => {});
  const playHistoryRef = useRef<number[]>([]);
  const failedSourceKeysRef = useRef<Set<string>>(new Set());

  const historyIdRef = useRef<number | null>(null);
  const historySessionRef = useRef(0);
  const persistOnUnmountRef = useRef<() => void>(() => {});
  const historySongIdRef = useRef<number | null>(null);
  const historyCreatePromiseRef = useRef<Promise<number | null> | null>(null);
  const lastPersistedSecondRef = useRef(0);

  const [, setLocation] = useLocation();

  const viewedMood = moodFor(selectedMood);

  const viewedTracksRaw = selectedPlaylist
    ? selectedPlaylist.trackTitles.flatMap((title) =>
        tracks.filter((track) => track.title === title)
      )
    : tracks.filter((track) => track.mood === selectedMood);

  const viewedTracks =
    viewedTracksRaw.length > 0
      ? viewedTracksRaw
      : tracks.filter((track) => track.mood === selectedMood);

  // Before playback starts, the player previews the room being viewed.
  // Once playback has started, it stays on activeQueue until the user
  // explicitly presses Play on another room or selects another song.
  const playerTracks =
    activeQueue.length > 0
      ? activeQueue
      : viewedTracks;

  const safeTrackIndex =
    playerTracks.length > 0
      ? trackIndex % playerTracks.length
      : 0;

  const current =
    playerTracks.length > 0
      ? playerTracks[safeTrackIndex]
      : tracks[0] ?? fallbackTracks[0];

  useEffect(() => {
    onPlaybackView({ trackId: playerStarted ? current.id : undefined, mood: playerStarted ? activeMoodName : undefined, playing: isPlaying, likedIds: likedSongIds });
  }, [current.id, activeMoodName, isPlaying, likedSongIds, playerStarted, onPlaybackView]);

  useEffect(() => {
    if (!playerStarted || !('mediaSession' in navigator) || !('MediaMetadata' in window)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, artwork: artworkSources(current).map(src => ({ src })) });
  }, [current.title, current.artist, current.audioUrl, current.coverUrl, playerStarted]);

  const activeMood = moodFor(
    activeQueue.length > 0
      ? activeMoodName
      : selectedMood
  );

  const totalSeconds =
    durationSeconds > 0
      ? durationSeconds
      : parseDuration(current.duration);

  const displayedSeconds =
    seekPreviewSeconds ?? currentSeconds;

  const progressPercent =
    totalSeconds > 0
      ? Math.min(100, (displayedSeconds / totalSeconds) * 100)
      : 0;


  playerTracksRef.current = playerTracks;
  trackIndexRef.current = safeTrackIndex;
  shuffleEnabledRef.current = shuffleEnabled;
  isPlayingRef.current = isPlaying;

  if (!currentTrackRef.current && current) {
    currentTrackRef.current = current;
  }

  const readPlayerTime = () => {
    try {
      const value = Number(mediaPlayerRef.current?.getCurrentTime?.() ?? 0);
      return Number.isFinite(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  };

  const readPlayerDuration = () => {
    try {
      const value = Number(mediaPlayerRef.current?.getDuration?.() ?? 0);
      return Number.isFinite(value) && value > 0
        ? value
        : parseDuration(currentTrackRef.current?.duration ?? current.duration);
    } catch {
      return parseDuration(currentTrackRef.current?.duration ?? current.duration);
    }
  };

  const beginListeningSession = (track: Track) => {
    if (!track.id || !Number.isFinite(userId)) return;

    if (historySongIdRef.current !== track.id) {
      historySessionRef.current++;
      historySongIdRef.current = track.id;
      historyIdRef.current = null;
      historyCreatePromiseRef.current = null;
      lastPersistedSecondRef.current = 0;
    }
  };

  const persistListeningProgress = async (
    completed = false,
    skipped = false
  ) => {
    const track = currentTrackRef.current;
    if (!track?.id || !Number.isFinite(userId)) return;

    const progressSeconds = Math.max(0, Math.floor(readPlayerTime()));

    if (progressSeconds <= 0 && !completed && !skipped) {
      return;
    }

    beginListeningSession(track);
    const session = historySessionRef.current;

    try {
      let historyId = historyIdRef.current;

      if (!historyId) {
        if (!historyCreatePromiseRef.current) {
          const songId = track.id;

          historyCreatePromiseRef.current = (async () => {
            const payload = await apiRequest(
              `/users/${userId}/listening-history`,
              {
                method: 'POST',
                body: JSON.stringify({
                  song_id: songId,
                  progress_seconds: progressSeconds,
                  completed,
                  skipped,
                }),
              }
            ) as { history_id?: number };

            const createdId = Number(payload.history_id);

            if (
              historySongIdRef.current === songId &&
              historySessionRef.current === session &&
              Number.isFinite(createdId) &&
              createdId > 0
            ) {
              historyIdRef.current = createdId;
            }

            return Number.isFinite(createdId) && createdId > 0
              ? createdId
              : null;
          })();
        }

        historyId = await historyCreatePromiseRef.current;
        if (historySessionRef.current !== session) return;
        historyCreatePromiseRef.current = null;

        // The POST already carried the latest progress/state.
        lastPersistedSecondRef.current = progressSeconds;
        return;
      }

      await apiRequest(
        `/users/${userId}/listening-history/${historyId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            progress_seconds: progressSeconds,
            completed,
            skipped,
          }),
        }
      );

      if (historySessionRef.current === session) lastPersistedSecondRef.current = progressSeconds;
    } catch (error) {
      if (historySessionRef.current === session) historyCreatePromiseRef.current = null;
      console.error('Failed to persist listening history:', error);
    }
  };

  const finishListeningSession = async (
    completed = false,
    skipped = false
  ) => {
    const songId = historySongIdRef.current;
    if (!songId) return;

    const historyId = historyIdRef.current;
    const pendingCreate = historyCreatePromiseRef.current;
    historySessionRef.current++;
    const progressSeconds = Math.max(0, Math.floor(readPlayerTime()));
    historyIdRef.current = null;
    historySongIdRef.current = null;
    historyCreatePromiseRef.current = null;
    lastPersistedSecondRef.current = 0;

    try {
      const resolvedId = historyId ?? await pendingCreate;
      await apiRequest(
        resolvedId
          ? `/users/${userId}/listening-history/${resolvedId}`
          : `/users/${userId}/listening-history`,
        {
          method: resolvedId ? 'PUT' : 'POST',
          body: JSON.stringify({ song_id: songId, progress_seconds: progressSeconds, completed, skipped }),
        }
      );
    } catch (error) {
      console.error('Failed to finish listening history:', error);
    }
  };

  const loadTrackIntoPlayer = (track: Track, autoplay = true) => {
    const source = resolvePlaybackSource(track.audioUrl);
    if (!source || !mediaPlayerRef.current) {
      setNotice(`"${track.title}" does not have an accessible playback URL.`);
      return false;
    }

    failedSourceKeysRef.current.delete(source.key);
    currentTrackRef.current = track;
    setPlayerStarted(true);
    setSeekPreviewSeconds(null);
    setCurrentSeconds(0);
    setDurationSeconds(parseDuration(track.duration));
    mediaPlayerRef.current.setVolume(volume);
    if (isMuted) mediaPlayerRef.current.mute();
    else mediaPlayerRef.current.unMute();
    mediaPlayerRef.current.loadSource(source, autoplay);
    return true;
  };

  const loadFavorites = async () => {
    if (!Number.isFinite(userId)) {
      return;
    }

    try {
      const payload = await apiRequest(
        `/users/${userId}/liked-songs`
      );

      const rows =
        Array.isArray(payload)
          ? payload
          : [];

      const ids = new Set<number>();

      for (const row of rows) {
        if (
          !row ||
          typeof row !== 'object'
        ) {
          continue;
        }

        const song = (
          row as {
            song?: { id?: number };
          }
        ).song;

        if (
          Number.isFinite(
            Number(song?.id)
          )
        ) {
          ids.add(Number(song?.id));
        }
      }

      setLikedSongIds(ids);
    } catch (error) {
      console.error(
        'Failed to load favorites:',
        error
      );
    }
  };

  useEffect(() => {
    void loadFavorites();
  }, [userId]);

  const findPlayableTrack = (
    direction: 1 | -1,
    queue: Track[] = playerTracksRef.current,
    baseIndex: number = trackIndexRef.current
  ) => {
    if (queue.length === 0) return -1;

    const playableIndexes = queue
      .map((track, index) => ({ track, index }))
      .filter(({ track }) => {
        const source = resolvePlaybackSource(track.audioUrl);
        return Boolean(source && !failedSourceKeysRef.current.has(source.key));
      })
      .map(({ index }) => index);

    if (playableIndexes.length === 0) return -1;

    if (
      direction === 1 &&
      shuffleEnabledRef.current &&
      playableIndexes.length > 1
    ) {
      const alternatives = playableIndexes.filter(
        (index) => index !== baseIndex
      );

      return alternatives[
        Math.floor(Math.random() * alternatives.length)
      ];
    }

    for (let step = 1; step <= queue.length; step++) {
      const candidate =
        (baseIndex + direction * step + queue.length) % queue.length;

      if (playableIndexes.includes(candidate)) {
        return candidate;
      }
    }

    return playableIndexes[0] ?? -1;
  };

  const switchToTrack = async (
    index: number,
    markCurrentSkipped = true,
    queueOverride?: Track[],
    moodOverride?: MoodName,
    roomNameOverride?: string,
    rememberPrevious = true
  ) => {
    const queue =
      queueOverride && queueOverride.length > 0
        ? queueOverride
        : playerTracksRef.current;

    const track = queue[index];

    if (!track || !resolvePlaybackSource(track.audioUrl)) {
      setNotice(
        track
          ? `"${track.title}" is not playable right now.`
          : 'That track is unavailable.'
      );
      return;
    }

    const oldIndex = trackIndexRef.current;
    const oldTrack = currentTrackRef.current;
    const hadProgress = readPlayerTime() > 0;

    if (historySongIdRef.current) {
      // Keep play() in the click gesture; history writes must never delay music.
      void finishListeningSession(false, Boolean(markCurrentSkipped && hadProgress));
    }

    if (
      rememberPrevious &&
      playerStarted &&
      oldTrack &&
      (oldTrack.id !== track.id || oldIndex !== index)
    ) {
      playHistoryRef.current.push(oldIndex);
      if (playHistoryRef.current.length > 50) {
        playHistoryRef.current.shift();
      }
    }

    if (queueOverride && queueOverride.length > 0) {
      if (queueOverride !== playerTracksRef.current) playHistoryRef.current = [];
      setActiveQueue(queueOverride);
      setActiveMoodName(moodOverride ?? track.mood);
      setActiveRoomName(
        roomNameOverride ?? selectedPlaylist?.name ?? 'Mood mix'
      );
      playerTracksRef.current = queueOverride;
    }

    setTrackIndex(index);
    trackIndexRef.current = index;
    currentTrackRef.current = track;
    setIsPlaying(false);
    isPlayingRef.current = false;

    loadTrackIntoPlayer(track, true);
  };

  const playViewedRoom = () => {
    if (viewedTracks.length === 0) {
      setNotice('No playable songs were found in this room.');
      return;
    }

    const firstPlayable = viewedTracks.findIndex(
      (track) => Boolean(resolvePlaybackSource(track.audioUrl))
    );

    if (firstPlayable === -1) {
      setNotice('No playable songs were found in this room.');
      return;
    }

    void switchToTrack(
      firstPlayable,
      true,
      viewedTracks,
      selectedMood,
      selectedPlaylist?.name ?? 'Mood mix'
    );
  };

  const advanceTrack = (
    direction: 1 | -1,
    automatic = false
  ) => {
    const queue = playerTracksRef.current;

    if (direction === -1 && playHistoryRef.current.length > 0) {
      const previousIndex = playHistoryRef.current.pop();
      const previousSource = previousIndex != null ? resolvePlaybackSource(queue[previousIndex]?.audioUrl) : null;
      if (previousIndex != null && previousSource && !failedSourceKeysRef.current.has(previousSource.key)) {
        void switchToTrack(
          previousIndex,
          !automatic,
          undefined,
          undefined,
          undefined,
          false
        );
        return;
      }
    }

    const nextIndex = findPlayableTrack(
      direction,
      queue,
      trackIndexRef.current
    );

    if (nextIndex === -1) {
      setNotice('No playable songs were found in the active queue.');
      return;
    }

    void switchToTrack(
      nextIndex,
      !automatic,
      undefined,
      undefined,
      undefined,
      direction === 1
    );
  };

  advanceTrackRef.current = advanceTrack;

  const nextTrack = () => advanceTrack(1, false);
  const previousTrack = () => advanceTrack(-1, false);

  const selectViewedTrack = (index: number) => {
    void switchToTrack(
      index,
      true,
      viewedTracks,
      selectedMood,
      selectedPlaylist?.name ?? 'Mood mix'
    );
  };

  const toggleShuffle = () => {
    const next = !shuffleEnabledRef.current;
    shuffleEnabledRef.current = next;
    setShuffleEnabled(next);
    setNotice(`Shuffle ${next ? 'on' : 'off'}.`);
  };

  const seekToSeconds = (nextSeconds: number) => {
    if (
      !playerStarted ||
      !playerReadyRef.current ||
      !mediaPlayerRef.current ||
      totalSeconds <= 0
    ) {
      return;
    }

    const target = Math.max(
      0,
      Math.min(totalSeconds, Number(nextSeconds) || 0)
    );

    setSeekPreviewSeconds(target);
    setCurrentSeconds(target);

    try {
      mediaPlayerRef.current.seekTo(target);
    } catch (error) {
      console.error('Could not seek player:', error);
      setNotice('The player could not seek to that position.');
    }

    // Let the media clock take over again after the seek settles.
    window.setTimeout(() => {
      setSeekPreviewSeconds(null);
    }, 250);
  };

  const setPlayerVolume = (nextVolume: number) => {
    const normalized = Math.max(0, Math.min(100, nextVolume));
    setVolume(normalized);

    try {
      mediaPlayerRef.current?.setVolume?.(normalized);

      if (normalized > 0 && isMuted) {
        mediaPlayerRef.current?.unMute?.();
        setIsMuted(false);
      }
    } catch (error) {
      console.error('Could not set player volume:', error);
    }
  };

  const toggleMute = () => {
    try {
      if (isMuted) {
        mediaPlayerRef.current?.unMute?.();
        mediaPlayerRef.current?.setVolume?.(volume);
        setIsMuted(false);
      } else {
        mediaPlayerRef.current?.mute?.();
        setIsMuted(true);
      }
    } catch (error) {
      console.error('Could not toggle mute:', error);
    }
  };

  const togglePlayback = () => {
    if (!playerStarted) {
      if (activeQueue.length === 0) {
        const currentIndex = Math.max(
          0,
          viewedTracks.findIndex(
            (track) => track.title === current.title
          )
        );

        void switchToTrack(
          currentIndex,
          false,
          viewedTracks,
          selectedMood,
          selectedPlaylist?.name ?? 'Mood mix'
        );
        return;
      }

      const track = currentTrackRef.current ?? current;
      if (!loadTrackIntoPlayer(track, true)) return;
      return;
    }

    const player = mediaPlayerRef.current;

    if (!player) return;
    const source = resolvePlaybackSource(currentTrackRef.current?.audioUrl);
    if (source && failedSourceKeysRef.current.has(source.key)) {
      loadTrackIntoPlayer(currentTrackRef.current ?? current, true);
      return;
    }

    try {
      if (isPlayingRef.current) {
        player.pauseVideo?.();
      } else {
        player.playVideo?.();
      }
    } catch (error) {
      console.error('Could not toggle playback:', error);
      setNotice('The player could not change playback state.');
    }
  };

  const toggleFavorite = async (favoriteTrack: Track = current) => {
    if (
      !favoriteTrack.id ||
      !Number.isFinite(userId)
    ) {
      setNotice(
        'This track cannot be added to favorites.'
      );
      return;
    }

    const isFavorite =
      likedSongIds.has(favoriteTrack.id);

    try {
      if (isFavorite) {
        await apiRequest(
          `/users/${userId}/liked-songs/${favoriteTrack.id}`,
          { method: 'DELETE' }
        );
      } else {
        await apiRequest(
          `/users/${userId}/liked-songs`,
          {
            method: 'POST',
            body: JSON.stringify({
              song_id: favoriteTrack.id,
            }),
          }
        );
      }

      setLikedSongIds(
        (previous) => {
          const next =
            new Set(previous);

          if (isFavorite) {
            next.delete(
              favoriteTrack.id as number
            );
          } else {
            next.add(
              favoriteTrack.id as number
            );
          }

          return next;
        }
      );

      setNotice(
        isFavorite
          ? `${favoriteTrack.title} removed from favorites.`
          : `${favoriteTrack.title} added to favorites.`
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not update favorites.'
      );
    }
  };

  galleryControls.current = { toggle: togglePlayback, favorite: (track) => { void toggleFavorite(track); } };

  // Search and the showcase Play button explicitly request playback; browsing does not.
  useEffect(() => {
    if (
      !(selectedPlaylist?.id.startsWith('single-') || selectedPlaylist?.id.startsWith('play-')) ||
      viewedTracks.length === 0
    ) {
      return;
    }

    const requestedIndex = viewedTracks.findIndex(
      (track) => Boolean(resolvePlaybackSource(track.audioUrl)) && (!selectedPlaylist.requestedTrackTitle || track.title === selectedPlaylist.requestedTrackTitle)
    );

    if (requestedIndex >= 0) {
      void switchToTrack(
        requestedIndex,
        true,
        viewedTracks,
        selectedMood,
        selectedPlaylist.name
      );
    }
  }, [selectedPlaylist?.id]);

  playerStateHandlerRef.current = (state: number) => {
    const YT = (window as any).YT;
    const states = YT?.PlayerState ?? {
      ENDED: 0,
      PLAYING: 1,
      PAUSED: 2,
      BUFFERING: 3,
      CUED: 5,
    };

    if (state === states.PLAYING) {
      setIsPlaying(true);
      isPlayingRef.current = true;
      const track = currentTrackRef.current;
      const source = resolvePlaybackSource(track?.audioUrl);
      if (source) failedSourceKeysRef.current.delete(source.key);

      if (track) beginListeningSession(track);
      return;
    }

    if (state === states.PAUSED) {
      setIsPlaying(false);
      isPlayingRef.current = false;
      void persistListeningProgress(false, false);
      return;
    }

    if (state === states.ENDED) {
      setIsPlaying(false);
      isPlayingRef.current = false;

      void finishListeningSession(true, false);
      advanceTrackRef.current(1, true);
    }
  };

  playerErrorHandlerRef.current = (message, source) => {
    const activeSource = resolvePlaybackSource(currentTrackRef.current?.audioUrl);
    if (source.key !== activeSource?.key || failedSourceKeysRef.current.has(source.key)) return;
    failedSourceKeysRef.current.add(source.key);
    setIsPlaying(false);
    isPlayingRef.current = false;
    // A failed source must never silently replace the song the listener chose.
    setNotice(`${message} Press Play to retry this song, or choose another track.`);
  };

  persistOnUnmountRef.current = () => {
    if (historySongIdRef.current) void finishListeningSession(false, false);
  };

  useEffect(() => {
    if (!playerContainerRef.current) return;
    const player = new MediaPlayer(playerContainerRef.current, {
      onReady: (ready) => {
        playerReadyRef.current = ready;
        setPlayerReady(ready);
      },
      onState: (state) => playerStateHandlerRef.current(state),
      onUnavailable: (message, source) => playerErrorHandlerRef.current(message, source),
      onBlocked: (message) => playerNoticeRef.current(message),
    });
    mediaPlayerRef.current = player;
    return () => {
      persistOnUnmountRef.current();
      playerReadyRef.current = false;
      player.destroy();
      mediaPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!playerReadyRef.current || !playerStarted) return;

      const seconds = readPlayerTime();
      const duration = readPlayerDuration();

      setCurrentSeconds(seconds);
      if (duration > 0) setDurationSeconds(duration);

      if (
        isPlayingRef.current &&
        seconds >= lastPersistedSecondRef.current + 10
      ) {
        void persistListeningProgress(false, false);
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [playerStarted, userId]);

  const isCurrentFavorite =
    Boolean(
      current.id &&
      likedSongIds.has(current.id)
    );

  const isCurrentDownloaded =
    Boolean(
      current.id &&
      downloadedSongIds.has(current.id)
    );

  const visibleYouTube = playerStarted && resolvePlaybackSource(current.audioUrl)?.kind === 'youtube';
  const playerFrame = (
    <section className={visibleYouTube ? 'source-player-section' : 'source-player-section--empty'} aria-label={visibleYouTube ? 'Song source' : undefined}>
    <div className={`playback-engine ${visibleYouTube ? 'playback-engine--youtube' : ''}`} aria-hidden={!visibleYouTube} inert={!visibleYouTube} aria-label={visibleYouTube ? 'YouTube playback controls' : undefined}>
      <div ref={playerContainerRef} />
    </div>
    {visibleYouTube && <div className="source-player-caption"><span>YOUTUBE</span><strong>{current.title}</strong><p>{current.artist}</p></div>}
    </section>
  );

  if (compact) {
    return (
      <>
        {playerFrame}

        {playerStarted && (
          <aside
            aria-label="Background player"
            data-testid="mini-player"
            style={{
              position: 'fixed',
              right: 22,
              bottom: 22,
              zIndex: 90,
              width: 'min(430px, calc(100vw - 32px))',
              padding: '13px 15px',
              border: `1px solid ${activeMood.color}55`,
              background:
                'rgba(12, 13, 18, 0.96)',
              boxShadow:
                '0 18px 60px rgba(0,0,0,.45)',
              backdropFilter:
                'blur(18px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <SongArtwork track={current} className="mini-player-artwork" />
              <button
                type="button"
                onClick={() =>
                  setLocation('/home')
                }
                title="Open Now playing"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    display: 'block',
                    color: activeMood.color,
                    fontSize: 10,
                    letterSpacing: '.15em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Now playing · {activeRoomName}
                </span>

                <strong
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 14,
                  }}
                >
                  {current.title}
                </strong>

                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: '#9d99a3',
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  {current.artist} · {formatDuration(displayedSeconds)} / {formatDuration(totalSeconds)}
                </span>
              </button>

              <button
                className="player-control"
                onClick={previousTrack}
                aria-label="Previous track"
                data-testid="mini-player-previous"
              >
                <SkipBack size={17} />
              </button>

              <button
                className="play-button"
                onClick={togglePlayback}
                aria-label={
                  isPlaying
                    ? 'Pause'
                    : 'Play'
                }
                data-testid="mini-player-play-pause"
                style={{
                  width: 38,
                  height: 38,
                  minWidth: 38,
                }}
              >
                {isPlaying ? (
                  <Pause
                    size={16}
                    fill="currentColor"
                  />
                ) : (
                  <Play
                    size={16}
                    fill="currentColor"
                  />
                )}
              </button>

              <button
                className="player-control"
                onClick={nextTrack}
                aria-label="Next track"
                data-testid="mini-player-next"
              >
                <SkipForward size={17} />
              </button>

              <button
                className="player-control"
                onClick={toggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                data-testid="mini-player-volume"
                title={`Volume ${isMuted ? 0 : volume}%`}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={16} />
                ) : (
                  <Volume2 size={16} />
                )}
              </button>
            </div>

            <div
              style={{
                marginTop: 8,
              }}
            >
              <input
                type="range"
                min={0}
                max={Math.max(totalSeconds, 1)}
                step={0.1}
                value={Math.min(displayedSeconds, Math.max(totalSeconds, 1))}
                onChange={(event) =>
                  seekToSeconds(Number(event.currentTarget.value))
                }
                disabled={!playerStarted || !playerReady || totalSeconds <= 0}
                aria-label="Seek through current song"
                data-testid="mini-player-seek"
                title={`Seek: ${formatDuration(displayedSeconds)} / ${formatDuration(totalSeconds)}`}
                style={{
                  width: '100%',
                  margin: 0,
                  cursor:
                    playerStarted && playerReady && totalSeconds > 0
                      ? 'pointer'
                      : 'not-allowed',
                  accentColor: activeMood.color,
                }}
              />
            </div>
          </aside>
        )}
      </>
    );
  }

  return (
    <>
      {playerFrame}

      <section
        className="page"
        style={moodStyle(viewedMood)}
      >
        <div className="mood-hero animate-rise">
          <div className="hero-copy">
            <div className="eyebrow">
              Your room tonight / {selectedMood} / {selectedPlaylist?.name ?? 'Mood mix'}
            </div>

            <h1>{viewedMood.line}</h1>
            <p>{viewedMood.description}</p>

            <div className="hero-links">
              <button
                className="solid-button"
                onClick={playViewedRoom}
                data-testid="button-hero-play"
              >
                <Play
                  size={15}
                  fill="currentColor"
                />
                {' '}
                {activeQueue.length > 0 &&
                activeRoomName ===
                  (selectedPlaylist?.name ??
                    'Mood mix')
                  ? 'Restart this room'
                  : 'Play this room'}
              </button>

              <button
                className="outline-button"
                onClick={() =>
                  document
                    .getElementById(
                      'mood-player'
                    )
                    ?.scrollIntoView({
                      behavior: 'smooth',
                    })
                }
                data-testid="button-scroll-player"
              >
                <Volume2 size={15} />
                {' '}
                See the needle
              </button>
            </div>
          </div>

          <RecordCover mood={activeMood} track={current} isPlaying={isPlaying} />
        </div>

        <div
          className="player-grid animate-rise-2"
          id="mood-player"
        >
          <div className="player-panel">
            <div className="now-playing">
              <SongArtwork track={current} className="now-playing-artwork" />
              <div>
                <div
                  className="eyebrow"
                  style={{
                    color:
                      activeMood.color,
                  }}
                >
                  Now on the turntable
                </div>

                <div
                  className="track-title"
                  data-testid="text-current-track"
                >
                  {current.title}
                </div>

                <div className="track-artist">
                  {current.artist}
                  {playerStarted &&
                    activeRoomName !==
                      (selectedPlaylist?.name ??
                        'Mood mix') &&
                    ` · still playing from ${activeRoomName}`}
                </div>
              </div>
            </div>

            <div className="progress-wrap">
              <div
                className={`wave-row ${isPlaying ? "is-playing" : ""}`}
                aria-hidden="true"
              >
                {Array.from({
                  length: 34,
                }).map((_, index) => (
                  <span
                    key={index}
                    style={{
                      '--bar': `${
                        .25 +
                        ((index * 17) %
                          70) /
                          100
                      }`,
                    } as CSSProperties}
                  />
                ))}
              </div>

              <div
                className="progress-line"
                style={{
                  position: 'relative',
                  height: 22,
                  display: 'flex',
                  alignItems: 'center',
                  overflow: 'visible',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: 0,
                    width: `${progressPercent}%`,
                    height: 3,
                    background: activeMood.color,
                    pointerEvents: 'none',
                  }}
                />

                <input
                  type="range"
                  min={0}
                  max={Math.max(totalSeconds, 1)}
                  step={0.1}
                  value={Math.min(displayedSeconds, Math.max(totalSeconds, 1))}
                  onChange={(event) =>
                    seekToSeconds(Number(event.currentTarget.value))
                  }
                  disabled={!playerStarted || !playerReady || totalSeconds <= 0}
                  aria-label="Seek through current song"
                  data-testid="player-seek"
                  title={`Seek: ${formatDuration(displayedSeconds)} / ${formatDuration(totalSeconds)}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: 22,
                    margin: 0,
                    opacity: 0.9,
                    cursor:
                      playerStarted && playerReady && totalSeconds > 0
                        ? 'pointer'
                        : 'not-allowed',
                    accentColor: activeMood.color,
                  }}
                />
              </div>

              <div className="progress-times">
                <span>
                  {formatDuration(
                    displayedSeconds
                  )}
                </span>
                <span>
                  {formatDuration(totalSeconds)}
                </span>
              </div>
            </div>

            <div className="player-controls">
              <button
                className="player-control"
                onClick={toggleShuffle}
                aria-label={shuffleEnabled ? 'Turn shuffle off' : 'Turn shuffle on'}
                aria-pressed={shuffleEnabled}
                data-testid="button-shuffle"
                title={shuffleEnabled ? 'Shuffle on' : 'Shuffle off'}
                style={
                  shuffleEnabled
                    ? {
                        color: activeMood.color,
                        borderColor: activeMood.color,
                        background: `${activeMood.color}18`,
                      }
                    : undefined
                }
              >
                <Shuffle size={18} />
              </button>

              <button
                className="player-control"
                onClick={previousTrack}
                aria-label="Previous track"
                data-testid="button-previous"
              >
                <SkipBack size={20} />
              </button>

              <button
                className="play-button"
                onClick={togglePlayback}
                aria-label={
                  isPlaying
                    ? 'Pause'
                    : 'Play'
                }
                data-testid="button-play-pause"
              >
                {isPlaying ? (
                  <Pause
                    size={19}
                    fill="currentColor"
                  />
                ) : (
                  <Play
                    size={19}
                    fill="currentColor"
                  />
                )}
              </button>

              <button
                className="player-control"
                onClick={nextTrack}
                aria-label="Next track"
                data-testid="button-next"
              >
                <SkipForward size={20} />
              </button>

              <button
                className="player-control"
                onClick={() =>
                  void toggleFavorite()
                }
                aria-label={
                  isCurrentFavorite
                    ? 'Remove from favorites'
                    : 'Add to favorites'
                }
                data-testid="button-favorite"
                title={
                  isCurrentFavorite
                    ? 'Remove from favorites'
                    : 'Add to favorites'
                }
              >
                <Heart
                  size={18}
                  fill={
                    isCurrentFavorite
                      ? 'currentColor'
                      : 'none'
                  }
                />
              </button>

              {isPremium ? (
                <button
                  className="outline-button small-button"
                  onClick={() => void onDownload(current)}
                  disabled={!current.id || isCurrentDownloaded}
                  data-testid="button-download-current"
                  title={
                    isCurrentDownloaded
                      ? 'Already saved to downloads'
                      : 'Save to Premium downloads'
                  }
                >
                  <Download size={14} />
                  {isCurrentDownloaded ? 'Added to Downloads' : 'Download'}
                </button>
              ) : (
                <button
                  className="outline-button small-button"
                  onClick={() => {
                    setNotice(
                      'Unlock with Premium to save tracks to your downloads library.'
                    );
                    setLocation('/premium');
                  }}
                  data-testid="button-unlock-download-current"
                >
                  <LockKeyhole size={14} />
                  Unlock with Premium
                </button>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  minWidth: 120,
                }}
              >
                <button
                  className="player-control"
                  onClick={toggleMute}
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                  data-testid="button-volume"
                  title={isMuted ? 'Unmute' : `Volume ${volume}%`}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX size={18} />
                  ) : (
                    <Volume2 size={18} />
                  )}
                </button>

                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={isMuted ? 0 : volume}
                  onChange={(event) =>
                    setPlayerVolume(Number(event.target.value))
                  }
                  aria-label="Player volume"
                  data-testid="input-volume"
                  style={{
                    width: 78,
                    accentColor: activeMood.color,
                    cursor: 'pointer',
                  }}
                />
              </div>
            </div>
          </div>

          <div className="queue-panel">
            <div className="panel-heading">
              <h3>
                {selectedPlaylist?.name ??
                  `${selectedMood} mix`}
              </h3>
              <span>
                {viewedTracks.length} sides
              </span>
            </div>

            <div className="queue-list">
              {viewedTracks.map(
                (track, index) => (
                  <button
                    key={`${track.id ?? track.title}-${index}`}
                    className={`queue-item ${
                      track.id ===
                        current.id &&
                      activeRoomName ===
                        (selectedPlaylist?.name ??
                          'Mood mix')
                        ? 'current'
                        : ''
                    }`}
                    onClick={() =>
                      selectViewedTrack(
                        index
                      )
                    }
                    data-testid={`button-queue-track-${index}`}
                  >
                    <SongArtwork track={track} className="queue-artwork" />

                    <span>
                      <strong>
                        {track.title}
                      </strong>
                      <small>
                        {track.artist}
                      </small>
                    </span>

                    <span className="queue-duration">
                      {track.duration}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div
          className="hairline"
          style={{
            margin: '45px 0 24px',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <span className="muted">
            Not quite the room you meant?
          </span>

          <button
            className="outline-button small-button"
            onClick={() => {
              setLocation('/');
              setNotice(
                'The room is ready for a new feeling.'
              );
              window.scrollTo({
                top: 0,
                behavior: 'smooth',
              });
            }}
            data-testid="button-choose-another"
          >
            <RotateCcw size={14} />
            {' '}
            Choose another mood
          </button>
        </div>
      </section>
    </>
  );
}

function PlaylistCover({ playlist, tracks }: { playlist: Playlist; tracks: Track[] }) {
  const mood = moodFor(playlist.mood);
  const firstTrack = tracks.find(track => track.title === playlist.trackTitles[0]);
  return <div className="cover-art" style={moodStyle(mood)}>{firstTrack ? <SongArtwork track={firstTrack} className="playlist-artwork" /> : <img src={mood.art} alt={`${playlist.mood} playlist artwork`} className="playlist-mood-art" />}<span className="cover-label">{playlist.mood}</span></div>;
}

function vibeNames(mood: MoodName, vibe: string, chosenTracks: Track[]) {
  const words = vibe.trim().split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  const artist = chosenTracks[0]?.artist;
  const names: Record<MoodName, string[]> = {
    Happy: ['Sunlit Side A', 'Windows Down Forever', 'Good News in Stereo'],
    Sad: ['Blue Hour Letters', 'Softly, After All', 'Rain on Side B'],
    Neutral: ['The Middle Distance', 'Between the Lines', 'No Rush Radio'],
    Exhausted: ['Low Battery Lounge', 'A Quiet Kind of Gold', 'Rest Mode'],
    Angry: ['Turn It Up', 'Redline Records', 'Pressure Release'],
  };
  const base = words ? `${words.replace(/^\w/, (letter) => letter.toUpperCase())} / ${mood}` : names[mood][0];
  return [base, names[mood][1], artist ? `${artist} and the ${mood.toLowerCase()} hour` : names[mood][2]];
}

function PlaylistBuilder({
  onCreate,
  tracks,
  isPremium,
  setNotice,
}: {
  onCreate: (playlist: Playlist) => Promise<void> | void;
  tracks: Track[];
  isPremium: boolean;
  setNotice: (notice: string) => void;
}) {
  const [name, setName] = useState('');
  const [mood, setMood] = useState<MoodName>('Neutral');
  const [vibe, setVibe] = useState('');
  const [songQuery, setSongQuery] = useState('');
  const [selectedTracks, setSelectedTracks] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const selected = tracks.filter((track) =>
    selectedTracks.includes(track.title)
  );

  const matches = tracks.filter((track) => {
    const value =
      `${track.title} ${track.artist}`.toLowerCase();

    return (
      !songQuery.trim() ||
      value.includes(songQuery.trim().toLowerCase())
    );
  }).slice(0, 6);

  const toggleTrack = (title: string) => {
    setSelectedTracks((current) =>
      current.includes(title)
        ? current.filter((track) => track !== title)
        : [...current, title]
    );
  };

  const suggest = () => {
    setIsThinking(true);

    window.setTimeout(() => {
      setSuggestions(
        vibeNames(mood, vibe, selected)
      );
      setIsThinking(false);
    }, 350);
  };

  const priorityCurate = () => {
    if (!isPremium) {
      setNotice('Unlock with Premium to use priority playlist curation.');
      return;
    }

    const tokens = vibe
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3);

    const moodPool = tracks.filter(
      (track) => track.mood === mood
    );

    const source =
      moodPool.length >= 5
        ? moodPool
        : tracks;

    const ranked = [...source]
      .map((track, index) => {
        const searchable =
          `${track.title} ${track.artist} ${track.genre ?? ''} ${track.language ?? ''}`
            .toLowerCase();

        const tokenScore = tokens.reduce(
          (score, token) =>
            score + (searchable.includes(token) ? 5 : 0),
          0
        );

        const moodScore =
          track.mood === mood ? 20 : 0;

        const playableScore =
          track.audioUrl ? 3 : 0;

        return {
          track,
          score:
            moodScore +
            tokenScore +
            playableScore -
            index * 0.001,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(10, source.length))
      .map(({ track }) => track);

    const curatedTitles = ranked.map(
      (track) => track.title
    );

    setSelectedTracks(curatedTitles);

    const curatedNames =
      vibeNames(mood, vibe, ranked);

    setSuggestions(curatedNames);

    if (!name.trim()) {
      setName(curatedNames[0]);
    }

    setNotice(
      `Priority curation selected ${ranked.length} ${mood.toLowerCase()} tracks for this room.`
    );
  };

  const create = async () => {
    const finalName =
      name.trim() || suggestions[0];

    if (!finalName || isCreating) {
      return;
    }

    setIsCreating(true);

    try {
      await onCreate({
        id: `pending-${Date.now()}`,
        name: finalName,
        mood,
        count: selectedTracks.length,
        trackTitles: selectedTracks,
        description:
          vibe.trim() ||
          `A ${mood.toLowerCase()} room, made by you.`,
        isCustom: true,
      });

      setName('');
      setVibe('');
      setSongQuery('');
      setSelectedTracks([]);
      setSuggestions([]);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="playlist-builder animate-rise-2">
      <div className="builder-copy">
        <div className="eyebrow">Make a new record / AI naming desk</div>
        <h2>Build a playlist<br /><em>from the feeling up.</em></h2>
        <p>Choose a mood, collect a few songs, and let moobot suggest a name that fits the room.</p>

        <label className="field-label" htmlFor="playlist-name">
          Playlist name <span>optional</span>
        </label>

        <input
          id="playlist-name"
          className="builder-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Leave blank for an AI name"
          data-testid="input-new-playlist-name"
        />

        <label className="field-label" htmlFor="playlist-vibe">
          Describe the vibe
        </label>

        <textarea
          id="playlist-vibe"
          className="builder-input builder-textarea"
          value={vibe}
          onChange={(event) => setVibe(event.target.value)}
          placeholder="Late-night drive, messy dancing, quiet rain..."
          data-testid="input-playlist-vibe"
        />

        <div className="builder-fields">
          <label className="field-label" htmlFor="playlist-mood">
            Mood
          </label>

          <select
            id="playlist-mood"
            className="builder-input"
            value={mood}
            onChange={(event) =>
              setMood(event.target.value as MoodName)
            }
            data-testid="select-playlist-mood"
          >
            {moods.map((option) => (
              <option key={option.name} value={option.name}>
                {option.name}
              </option>
            ))}
          </select>

          <button
            className="outline-button builder-ai-button"
            onClick={suggest}
            disabled={isThinking || isCreating}
            data-testid="button-suggest-playlist-name"
          >
            <WandSparkles size={15} />
            {isThinking
              ? 'moobot is thinking…'
              : 'Ask moobot for names'}
          </button>

          {isPremium ? (
            <button
              className="solid-button builder-ai-button"
              onClick={priorityCurate}
              disabled={isCreating || tracks.length === 0}
              data-testid="button-priority-curate"
            >
              <Crown size={15} />
              Priority curate
            </button>
          ) : (
            <Link
              href="/premium"
              className="outline-button builder-ai-button"
              data-testid="link-unlock-priority-curation"
            >
              <LockKeyhole size={15} />
              Unlock with Premium
            </Link>
          )}
        </div>

        {suggestions.length > 0 && (
          <div
            className="ai-suggestions"
            aria-label="moobot playlist name suggestions"
          >
            <span className="ai-label">
              <Sparkles size={13} /> moobot suggests
            </span>

            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className={`suggestion-chip ${
                  name === suggestion ? 'selected' : ''
                }`}
                onClick={() => setName(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="builder-tracks">
        <div className="panel-heading">
          <h3>Add songs</h3>
          <span>{selectedTracks.length} selected</span>
        </div>

        <input
          className="builder-input"
          value={songQuery}
          onChange={(event) => setSongQuery(event.target.value)}
          placeholder="Search songs or artists"
          aria-label="Search songs to add"
          data-testid="input-builder-song-search"
        />

        <div className="builder-track-list">
          {matches.map((track) => {
            const isSelected =
              selectedTracks.includes(track.title);

            return (
              <button
                key={`${track.id ?? track.title}`}
                className={`builder-track ${
                  isSelected ? 'selected' : ''
                }`}
                onClick={() => toggleTrack(track.title)}
                data-testid={`button-builder-track-${track.title
                  .toLowerCase()
                  .replaceAll(' ', '-')}`}
              >
                <span className="builder-track-check">
                  {isSelected ? (
                    <Check size={13} />
                  ) : (
                    <Plus size={13} />
                  )}
                </span>

                <SongArtwork track={track} />
                <span>
                  <strong>{track.title}</strong>
                  <small>
                    {track.artist} / {track.mood}
                  </small>
                </span>
              </button>
            );
          })}
        </div>

        <button
          className="solid-button builder-create-button"
          onClick={create}
          disabled={
            isCreating ||
            (!name.trim() && suggestions.length === 0)
          }
          data-testid="button-create-playlist"
        >
          <Plus size={15} />
          {isCreating
            ? 'Saving playlist…'
            : 'Create playlist'}
        </button>
      </div>
    </section>
  );
}

function PlaylistsPage({
  library,
  tracks,
  openPlaylist,
  setNotice,
  onCreate,
  onDelete,
  isPremium,
}: {
  library: Playlist[];
  tracks: Track[];
  openPlaylist: (playlist: Playlist) => void;
  setNotice: (notice: string) => void;
  onCreate: (playlist: Playlist) => Promise<void> | void;
  onDelete: (playlist: Playlist) => Promise<void> | void;
  isPremium: boolean;
}) {
  const open = (playlist: Playlist) => {
    openPlaylist(playlist);
    setNotice(`Opening ${playlist.name}.`);
  };

  return (
    <section className="page">
      <div className="page-heading animate-rise">
        <div>
          <div className="eyebrow">The record shelf / 005</div>
          <h1>My<br /><em>playlists</em></h1>
        </div>
        <Link href="/restore" className="outline-button" data-testid="link-restore-from-playlists">
          <RotateCcw size={15} /> Restore a playlist
        </Link>
      </div>

      <PlaylistBuilder
        tracks={tracks}
        onCreate={onCreate}
        isPremium={isPremium}
        setNotice={setNotice}
      />

      <div className="library-grid animate-rise-2">
        {library.map((playlist) => (
          <article className="library-card" key={playlist.id} data-testid={`card-playlist-${playlist.id}`}>
            <PlaylistCover playlist={playlist} tracks={tracks} />
            <div className="cover-meta">
              <div>
                <h2>{playlist.name}</h2>
                <p>{playlist.trackTitles.length} tracks / {playlist.description}</p>
              </div>
              <Disc3 size={17} color={moodFor(playlist.mood).color} />
            </div>
            <div className="card-actions">
              <button className="solid-button small-button" onClick={() => open(playlist)} data-testid={`button-open-playlist-${playlist.id}`}>
                <Play size={13} fill="currentColor" /> Open
              </button>

              {playlist.backendId && (
                <button
                  className="icon-button"
                  onClick={() => void onDelete(playlist)}
                  aria-label={`Delete ${playlist.name}`}
                  data-testid={`button-delete-playlist-${playlist.id}`}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {library.length === 0 && (
        <div className="empty-state" style={{ marginTop: 15 }}>
          <h2>The shelf is empty.</h2>
          <p>Create a playlist and it will be saved to your MOOSIC account.</p>
        </div>
      )}
    </section>
  );
}

function RestorePage({
  tracks,
  deletedPlaylists,
  setNotice,
  onRestore,
  onRestoreAll,
}: {
  tracks: Track[];
  deletedPlaylists: Playlist[];
  setNotice: (notice: string) => void;
  onRestore: (playlist: Playlist) => Promise<void> | void;
  onRestoreAll: () => Promise<void> | void;
}) {
  return (
    <section className="page">
      <div className="eyebrow animate-rise">The back room / 003</div>
      <div className="restore-panel animate-rise-2" style={{ marginTop: 26 }}>
        <div className="restore-disc" />
        <h1>Nothing is<br /><em>ever really gone.</em></h1>

        {deletedPlaylists.length > 0 ? (
          <>
            <p>
              {deletedPlaylists.length} deleted{' '}
              {deletedPlaylists.length === 1 ? 'record is' : 'records are'} waiting here.
              Choose what deserves another spin.
            </p>

            <div className="restore-list">
              {deletedPlaylists.map((playlist) => (
                <div className="restore-item" key={playlist.id}>
                  <PlaylistCover playlist={playlist} tracks={tracks} />
                  <div className="restore-item-copy">
                    <strong>{playlist.name}</strong>
                    <span>{playlist.trackTitles.length} tracks / {playlist.mood}</span>
                  </div>
                  <button
                    className="solid-button small-button"
                    onClick={() => void onRestore(playlist)}
                    data-testid={`button-restore-playlist-${playlist.id}`}
                  >
                    <RotateCcw size={14} /> Restore
                  </button>
                </div>
              ))}
            </div>

            <button
              className="outline-button small-button"
              onClick={() => void onRestoreAll()}
              data-testid="button-restore-all"
            >
              <RotateCcw size={14} /> Restore all
            </button>
          </>
        ) : (
          <>
            <p>Your deleted records will wait here for a little while. The back room is empty for now, but it knows how to hold a place.</p>
            <Link href="/playlists" className="outline-button" data-testid="link-restore-back-library">
              <ListMusic size={15} /> Back to my playlists
            </Link>
          </>
        )}
      </div>

      <div style={{ marginTop: 32, color: '#777481', fontSize: 13 }} className="animate-rise-3">
        <span style={{ color: '#f1bc46' }}>A small promise:</span> accidental taps do not get the last word.
      </div>
    </section>
  );
}

function DownloadsPage({
  isPremium,
  downloads,
  tracks,
  playTrack,
  onRemove,
}: {
  isPremium: boolean;
  downloads: BackendDownload[];
  tracks: Track[];
  playTrack: (track: Track) => void;
  onRemove: (songId: number) => Promise<void> | void;
}) {
  if (!isPremium) {
    return (
      <section className="page">
        <div className="eyebrow animate-rise">
          Saved library / Premium
        </div>

        <div
          className="animate-rise-2"
          style={{
            maxWidth: 720,
            marginTop: 32,
            padding: '46px 42px',
            border: '1px solid rgba(241,188,70,.45)',
            borderRadius: 28,
            background:
              'linear-gradient(145deg, rgba(241,188,70,.07), rgba(255,255,255,.02))',
          }}
        >
          <Download size={28} color="#f1bc46" />

          <h1
            className="section-title"
            style={{ marginTop: 20 }}
          >
            Take the room <em>with you.</em>
          </h1>

          <p
            style={{
              color: '#aaa4ae',
              maxWidth: 540,
              lineHeight: 1.6,
            }}
          >
            Keep your favorite tracks together in Downloads.
            Your list stays saved to your account.
          </p>

          <Link
            href="/premium"
            className="solid-button"
            style={{
              display: 'inline-flex',
              marginTop: 18,
            }}
            data-testid="link-unlock-downloads"
          >
            <Crown size={15} />
            Unlock with Premium
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-heading animate-rise">
        <div>
          <div className="eyebrow">
            Saved library / Premium
          </div>
          <h1>
            Your<br /><em>downloads</em>
          </h1>
        </div>

        <Link
          href="/search"
          className="outline-button"
          data-testid="link-find-downloads"
        >
          <Search size={15} />
          Find tracks
        </Link>
      </div>

      <p className="muted" style={{ marginTop: 18, lineHeight: 1.6 }}>
        Your saved listening list. Tap Play to stream a song from here.
        {' '}Downloads keeps songs in your account; it doesn’t save audio files to your device.
      </p>

      {downloads.length > 0 ? (
        <div
          className="result-section animate-rise-2"
          style={{ marginTop: 24 }}
        >
          {downloads.map((download, index) => {
            const savedTrack = backendSongToTrack({
              id: download.song_id,
              title: download.title,
              artist_name: download.artist,
              audio_url: download.audio_url,
              cover_url: download.cover_url,
              mood: download.mood,
              duration: download.duration,
              genre: download.genre,
              language: download.language,
            });
            const track = tracks.find(candidate => candidate.id === download.song_id) ?? savedTrack;
            const playable = Boolean(resolvePlaybackSource(track.audioUrl));

            return (
              <div
                className="result-row"
                key={download.id}
              >
                <div className="result-row-main result-track">
                  <SongArtwork track={track} /><div><strong>{track.title}</strong>
                  <small>
                    {track.artist}{track.duration !== '--:--' ? ` · ${track.duration}` : ''}
                    {!playable && ' · Currently unavailable'}
                  </small></div>
                </div>

                <div className="result-row-actions">
                  <button
                    className="icon-button"
                    disabled={!playable}
                    onClick={() => playTrack(track)}
                    aria-label={`Play ${download.title}`}
                    data-testid={`button-play-download-${index}`}
                  >
                    <Play
                      size={14}
                      fill="currentColor"
                    />
                  </button>

                  <button
                    className="outline-button small-button"
                    onClick={() =>
                      void onRemove(download.song_id)
                    }
                    data-testid={`button-remove-download-${index}`}
                  >
                    <Trash2 size={13} />
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="empty-state animate-rise-2"
          style={{ marginTop: 24 }}
        >
          <Download size={26} />
          <h2>No downloads yet.</h2>
          <p>
            Tap Download on a song to add it here, then stream it whenever you like.
          </p>

          <Link
            href="/search"
            className="solid-button small-button"
          >
            Find a track
          </Link>
        </div>
      )}
    </section>
  );
}

function SearchPage({
  library,
  tracks,
  playTrack,
  openPlaylist,
  setNotice,
  addTrackToPlaylist,
  isPremium,
  downloadedSongIds,
  onDownload,
}: {
  library: Playlist[];
  tracks: Track[];
  playTrack: (track: Track) => void;
  openPlaylist: (playlist: Playlist) => void;
  setNotice: (notice: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Track) => Promise<void> | void;
  isPremium: boolean;
  downloadedSongIds: Set<number>;
  onDownload: (track: Track) => Promise<void> | void;
}) {
  const userPlaylists = library.filter(
    (playlist) => Boolean(playlist.backendId)
  );

  const [query, setQuery] = useState('');
  const [targetPlaylistId, setTargetPlaylistId] = useState(
    userPlaylists[0]?.id ?? ''
  );

  useEffect(() => {
    if (
      targetPlaylistId &&
      userPlaylists.some(
        (playlist) => playlist.id === targetPlaylistId
      )
    ) {
      return;
    }

    setTargetPlaylistId(
      userPlaylists[0]?.id ?? ''
    );
  }, [library, targetPlaylistId]);

  const normalized =
    query.trim().toLowerCase();

  const filteredTracks = useMemo(
    () =>
      normalized
        ? tracks.filter((track) =>
            `${track.title} ${track.artist} ${track.mood}`
              .toLowerCase()
              .includes(normalized)
          )
        : tracks,
    [normalized, tracks]
  );

  const filteredPlaylists = useMemo(
    () =>
      normalized
        ? library.filter((playlist) =>
            `${playlist.name} ${playlist.description} ${playlist.mood}`
              .toLowerCase()
              .includes(normalized)
          )
        : library,
    [normalized, library]
  );

  const hasResults =
    filteredTracks.length > 0 ||
    filteredPlaylists.length > 0;

  return (
    <section className="page">
      <div className="eyebrow animate-rise">The listening desk / 004</div>
      <h1 className="section-title animate-rise" style={{ margin: '15px 0 0' }}>
        Find a feeling,<br /><em>not just a song.</em>
      </h1>

      <label className="search-shell animate-rise-2">
        <Search />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="search-input"
          placeholder="Try “Adele”, “Hindi”, or “Happy”"
          aria-label="Search MOOSIC"
          data-testid="input-search"
        />
      </label>

      <div className="search-save-bar animate-rise-2">
        <span>Save songs to</span>

        <select
          value={targetPlaylistId}
          onChange={(event) =>
            setTargetPlaylistId(event.target.value)
          }
          aria-label="Playlist to add songs to"
          data-testid="select-search-playlist"
          disabled={userPlaylists.length === 0}
        >
          {userPlaylists.length === 0 ? (
            <option value="">Create a playlist first</option>
          ) : (
            userPlaylists.map((playlist) => (
              <option value={playlist.id} key={playlist.id}>
                {playlist.name}
              </option>
            ))
          )}
        </select>

        <span className="muted">
          {userPlaylists.length > 0
            ? 'Songs added here are saved to your account.'
            : 'Create a playlist in My playlists before adding songs.'}
        </span>
      </div>

      {hasResults ? (
        <div className="result-columns animate-rise-3">
          <div className="result-section">
            <h2>Songs / {filteredTracks.length}</h2>

            {filteredTracks.map((track, index) => (
              <div className="result-row" key={`${track.id ?? track.title}-${index}`}>
                <div className="result-row-main result-track">
                  <SongArtwork track={track} /><div><strong>{track.title}</strong>
                  <small>{track.artist} / {track.mood}</small></div>
                </div>

                <div className="result-row-actions">
                  <button
                    className="icon-button"
                    onClick={() => {
                      playTrack(track);
                      setNotice(`Playing ${track.title}.`);
                    }}
                    aria-label={`Play ${track.title}`}
                    data-testid={`button-search-track-${index}`}
                  >
                    <Play size={14} fill="currentColor" />
                  </button>

                  <button
                    className="solid-button small-button"
                    disabled={!targetPlaylistId || !track.id}
                    onClick={() =>
                      void addTrackToPlaylist(
                        targetPlaylistId,
                        track
                      )
                    }
                    data-testid={`button-add-search-track-${index}`}
                  >
                    <Plus size={13} /> Add
                  </button>

                  {isPremium ? (
                    <button
                      className="outline-button small-button"
                      disabled={
                        !track.id ||
                        downloadedSongIds.has(track.id)
                      }
                      onClick={() =>
                        void onDownload(track)
                      }
                      data-testid={`button-download-search-track-${index}`}
                    >
                      <Download size={13} />
                      {track.id &&
                      downloadedSongIds.has(track.id)
                        ? 'Added to Downloads'
                        : 'Download'}
                    </button>
                  ) : (
                    <Link
                      href="/premium"
                      className="outline-button small-button"
                      data-testid={`link-unlock-download-search-${index}`}
                    >
                      <LockKeyhole size={13} />
                      Unlock with Premium
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="result-section">
            <h2>Playlists / {filteredPlaylists.length}</h2>

            {filteredPlaylists.map((playlist, index) => (
              <div className="result-row" key={playlist.id}>
                <div className="result-row-main">
                  <strong>{playlist.name}</strong>
                  <small>{playlist.mood} / {playlist.trackTitles.length} tracks</small>
                </div>
                <button
                  className="icon-button"
                  onClick={() => {
                    openPlaylist(playlist);
                    setNotice(`Opening ${playlist.name}.`);
                  }}
                  aria-label={`Open ${playlist.name}`}
                  data-testid={`button-search-playlist-${index}`}
                >
                  <Disc3 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state animate-rise-3">
          <h2>That record isn’t on the shelf.</h2>
          <p>Try a song, artist, mood, or playlist title. The best finds are sometimes one letter away.</p>
          <button className="outline-button small-button" onClick={() => setQuery('')} data-testid="button-clear-search">
            <X size={14} /> Clear search
          </button>
        </div>
      )}
    </section>
  );
}

function PremiumPage({
  premiumStatus,
  onCancel,
  onMembershipChange,
  isBusy,
}: {
  premiumStatus: PremiumStatus | null;
  onCancel: () => Promise<void> | void;
  onMembershipChange: () => Promise<void>;
  isBusy: boolean;
}) {
  const isPremium = Boolean(premiumStatus?.is_premium);
  const checkingPlan = premiumStatus === null;
  const plans = [
    {
      name: 'Free',
      icon: Music2,
      description: 'A soundtrack for every kind of day.',
      features: ['Explore music by mood', 'Create and restore your playlists', 'Keep your favorites close'],
      active: !checkingPlan && !isPremium,
    },
    {
      name: 'Premium',
      icon: Crown,
      description: 'More ways to make MOOSIC yours.',
      features: ['Everything in Free', 'Custom colors for your listening room', 'A saved-track library across your devices'],
      active: isPremium,
    },
  ];

  return (
    <section className="page" style={{ maxWidth: 1060 }}>
      <div className="animate-rise" style={{ maxWidth: 640 }}>
        <div className="eyebrow">MOOSIC / YOUR MEMBERSHIP</div>
        <h1 className="display-title" style={{ fontSize: 'clamp(42px, 6vw, 74px)' }}>
          Make this room<br /><em>your own.</em>
        </h1>
        <p className="muted" style={{ fontSize: 18, lineHeight: 1.5 }}>
          Your music, your moods, and a little more room for your personality.
        </p>
      </div>

      <div className="playlist-choice-grid animate-rise-2" style={{ marginTop: 36 }}>
        {plans.map(({ name, icon: Icon, description, features, active }) => (
          <article key={name} style={{
            padding: 'clamp(22px, 3vw, 34px)',
            border: `1px solid ${active ? '#f1bc46' : 'rgba(247,239,205,.2)'}`,
            background: active ? 'rgba(241,188,70,.06)' : 'rgba(247,239,205,.025)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <Icon size={25} color="#f1bc46" strokeWidth={1.4} aria-hidden="true" />
              {active && <span className="eyebrow" style={{ fontSize: 10 }} data-testid="text-current-plan">Your current plan</span>}
            </div>
            <h2 className="section-title" style={{ margin: '24px 0 12px', fontSize: 40 }}>{name}</h2>
            <p className="muted" style={{ lineHeight: 1.5, margin: '0 0 28px' }}>{description}</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 16 }}>
              {features.map((feature) => (
                <li key={feature} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', lineHeight: 1.45 }}>
                  <Check size={17} color="#f1bc46" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="animate-rise-3" style={{ marginTop: 28, paddingTop: 26, borderTop: '1px solid rgba(247,239,205,.14)' }}>
        {checkingPlan ? (
          <p className="muted" role="status">Checking your membership…</p>
        ) : isPremium ? (
          <>
            <p style={{ margin: '0 0 18px', lineHeight: 1.5 }}>{premiumStatus?.source === 'demo' ? 'Demo payment successful — Premium is active. No money was charged.' : 'Your Premium membership is active.'} Set the mood and explore your saved tracks.</p>
            {premiumStatus?.expires_at && <p className="muted">Your paid pass ends {new Date(premiumStatus.expires_at).toLocaleDateString()}. It will not renew automatically.</p>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/theme" className="solid-button" data-testid="link-premium-themes"><Palette size={16} /> Choose a theme</Link>
              <Link href="/downloads" className="outline-button" data-testid="link-premium-library"><ListMusic size={16} /> Saved tracks</Link>
            </div>
            {(premiumStatus?.can_cancel ?? premiumStatus?.source !== 'purchase') && <>
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.5, margin: '22px 0 12px' }}>Cancel your demo Premium whenever you want. You can unlock it again with another demo payment.</p>
              <button type="button" className="outline-button small-button" onClick={() => void onCancel()} disabled={isBusy} data-testid="button-cancel-premium">
                {isBusy ? 'Cancelling…' : 'Cancel Premium'}
              </button>
            </>}
          </>
        ) : (
          <PremiumCheckout onMembershipChange={onMembershipChange} />
        )}
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 22 }}>Saved tracks stay in your MOOSIC account. An internet connection is required for playback.</p>
      </div>
    </section>
  );
}

function CustomThemePage({
  selectedColor,
  setSelectedColor,
  setNotice,
  isPremium,
}: {
  selectedColor: string | null;
  setSelectedColor: (color: string | null) => void;
  setNotice: (notice: string) => void;
  isPremium: boolean;
}) {
  const applyTheme = (color: string) => {
    if (!isPremium) {
      setNotice('Custom themes are a MOOSIC Premium feature.');
      return;
    }

    setSelectedColor(color);
    window.localStorage.setItem('moodsic-custom-theme', color);

    const theme = themePalette.find(
      (option) => option.color === color
    );

    setNotice(
      `Custom theme changed to ${theme?.name ?? color}.`
    );
  };

  const clearTheme = () => {
    setSelectedColor(null);
    window.localStorage.removeItem('moodsic-custom-theme');
    setNotice('Back to the mood room background.');
  };

  if (!isPremium) {
    return (
      <section className="page custom-theme-page">
        <div className="eyebrow animate-rise">
          Make the room yours / Premium
        </div>

        <div
          className="animate-rise-2"
          style={{
            maxWidth: 720,
            marginTop: 32,
            padding: '46px 42px',
            border: '1px solid rgba(241,188,70,.45)',
            borderRadius: 28,
            background:
              'linear-gradient(145deg, rgba(241,188,70,.07), rgba(255,255,255,.02))',
          }}
        >
          <LockKeyhole size={28} color="#f1bc46" />
          <h1
            className="section-title"
            style={{ marginTop: 20 }}
          >
            Premium <em>room styling.</em>
          </h1>
          <p
            style={{
              color: '#aaa4ae',
              maxWidth: 520,
              lineHeight: 1.6,
            }}
          >
            Unlimited custom themes are part of MOOSIC Premium.
            Your normal mood backgrounds remain available on the free plan.
          </p>

          <Link
            href="/premium"
            className="solid-button"
            style={{
              display: 'inline-flex',
              marginTop: 18,
            }}
          >
            <Crown size={15} />
            Unlock with Premium
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page custom-theme-page">
      <div className="eyebrow animate-rise">
        Make the room yours / 005
      </div>

      <div className="theme-heading animate-rise">
        <div>
          <h1 className="section-title">
            Custom <em>Theme</em>
          </h1>
          <p>
            Choose the background that matches how you feel right now.
            Your choice stays with you when you come back.
          </p>
        </div>

        <div
          className="theme-preview"
          style={{
            background: resolveRoomTheme(selectedColor ?? undefined).background,
            color: resolveRoomTheme(selectedColor ?? undefined).accent,
          }}
          aria-label={
            selectedColor
              ? `Current custom theme ${selectedColor}`
              : 'Using the current mood background'
          }
        >
          <span>
            {themePalette.find(
              (option) =>
                option.color === selectedColor
            )?.name ?? 'Mood room'}
          </span>
        </div>
      </div>

      <div
        className="theme-palette animate-rise-2"
        aria-label="Custom background colors"
      >
        {themePalette.map(
          ({ name, color, effect }) => (
            <button
              key={color}
              className={`theme-swatch ${
                selectedColor === color
                  ? 'selected'
                  : ''
              }`}
              style={{
                '--swatch': color,
              } as CSSProperties}
              onClick={() => applyTheme(color)}
              aria-label={`Use ${name} as the background`}
              aria-pressed={
                selectedColor === color
              }
              data-testid={`button-theme-${color.slice(1)}`}
            >
              <span className="theme-swatch-dot" />
              <span className="theme-swatch-copy">
                <strong>{name}</strong>
                <small>{effect} · after dark</small>
              </span>
              {selectedColor === color && (
                <Check size={16} />
              )}
            </button>
          )
        )}
      </div>

      <div className="theme-actions animate-rise-3">
        <button
          className="outline-button small-button"
          onClick={clearTheme}
          disabled={!selectedColor}
          data-testid="button-reset-theme"
        >
          Use mood background
        </button>
        <span className="muted">
          {selectedColor
            ? 'Custom background active across your listening room.'
            : 'Pick a color to replace the default dark background.'}
        </span>
      </div>
    </section>
  );
}

function ProfilePage({
  authUser,
  setNotice,
  onSignOut,
  onSaveProfile,
}: {
  authUser: AuthUser;
  setNotice: (notice: string) => void;
  onSignOut: () => void;
  onSaveProfile: (name: string, profileNote: string, username?: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(authUser.name);
  const [username, setUsername] = useState(authUser.username);
  const [profileNote, setProfileNote] = useState(authUser.profileNote ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState<ListeningStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    setName(authUser.name);
    setUsername(authUser.username);
    setProfileNote(authUser.profileNote ?? '');
  }, [authUser.name, authUser.username, authUser.profileNote]);

  useEffect(() => {
    let active = true;

    const loadStats = async () => {
      setStatsLoading(true);

      try {
        const payload = await apiRequest(
          `/users/${authUser.id}/listening-stats`
        ) as ListeningStats;

        if (active) {
          setStats(payload);
        }
      } catch (error) {
        console.error('Failed to load listening stats:', error);
        if (active) {
          setNotice(
            error instanceof Error
              ? error.message
              : 'Could not load your listening statistics.'
          );
        }
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    };

    void loadStats();

    return () => {
      active = false;
    };
  }, [authUser.id]);

  const cancel = () => {
    setName(authUser.name);
    setUsername(authUser.username);
    setProfileNote(authUser.profileNote ?? '');
    setEditing(false);
  };

  const save = async () => {
    const cleanedName = name.trim();
    const cleanedUsername = username.trim();

    if (!cleanedName) {
      setNotice('Your name cannot be empty.');
      return;
    }

    if (!cleanedUsername) {
      setNotice('Your username cannot be empty.');
      return;
    }

    setIsSaving(true);

    try {
      const saved = await onSaveProfile(cleanedName, profileNote.trim(), cleanedUsername);
      if (saved) {
        setEditing(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const currentNote = authUser.profileNote?.trim();
  const rotation = stats?.rotation ?? {
    Happy: 0,
    Neutral: 0,
    Sad: 0,
    Exhausted: 0,
    Angry: 0,
  };

  const memberSince = stats?.member_since
    ? new Date(stats.member_since).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <section className="page">
      <div className="eyebrow animate-rise">Your listening log / 006</div>
      <div className="profile-layout" style={{ marginTop: 27 }}>
        <div className="profile-panel animate-rise-2">
          <div className="profile-avatar">{avatarInitial(authUser)}</div>

          {editing ? (
            <div className="edit-form">
              <label htmlFor="profile-name">Name</label>
              <input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                data-testid="input-profile-name"
              />

              <label htmlFor="profile-username">Username</label>
              <input
                id="profile-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                maxLength={32}
                placeholder="Choose a username"
                data-testid="input-profile-username"
              />

              <label htmlFor="profile-note">Currently into</label>
              <input
                id="profile-note"
                value={profileNote}
                onChange={(event) => setProfileNote(event.target.value)}
                maxLength={180}
                placeholder="Slow records and late walks"
                data-testid="input-profile-note"
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 7 }}>
                <button
                  className="solid-button small-button"
                  onClick={() => void save()}
                  disabled={isSaving}
                  data-testid="button-save-profile"
                >
                  {isSaving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  className="outline-button small-button"
                  onClick={cancel}
                  disabled={isSaving}
                  data-testid="button-cancel-profile"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="profile-username">{authUser.username}</h1>
              <p>
                {authUser.name}
                {currentNote ? ` · ${currentNote}` : ' · Tell MOOSIC what you’re currently into.'}
              </p>
              <div className="profile-actions">
                <button
                  className="outline-button small-button"
                  onClick={() => setEditing(true)}
                  data-testid="button-edit-profile"
                >
                  <Pencil size={14} /> Edit profile
                </button>
                <button
                  className="sign-out-button"
                  onClick={onSignOut}
                  data-testid="button-sign-out"
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            </>
          )}
        </div>

        <div className="summary-panel animate-rise-3">
          <h2>{stats?.month_label ?? 'This month'}, in records</h2>

          <div className="stat-grid">
            <div className="stat">
              <b>{statsLoading ? '—' : (stats?.hours_listened ?? 0).toFixed(2)}</b>
              <span>hours listened</span>
            </div>
            <div className="stat">
              <b>{statsLoading ? '—' : stats?.records_visited ?? 0}</b>
              <span>records visited</span>
            </div>
            <div className="stat">
              <b>{statsLoading ? '—' : stats?.favorite_tracks ?? 0}</b>
              <span>favorite tracks</span>
            </div>
          </div>

          <div className="taste-list">
            <div className="eyebrow">Your current rotation</div>
            {moods.map((item) => {
              const value = rotation[item.name] ?? 0;

              return (
                <div className="taste-line" key={item.name}>
                  <span>{item.name}</span>
                  <div
                    className="taste-bar"
                    style={{ '--taste': item.color } as CSSProperties}
                  >
                    <span style={{ width: `${value}%` }} />
                  </div>
                  <span>{Math.round(value)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="hairline" style={{ marginTop: 28 }} />
      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', color: '#8c8893', fontSize: 14 }}>
        <span>
          {memberSince
            ? `Member since ${memberSince}`
            : 'Member since your first needle drop'}
        </span>
        <Music2 size={17} color="#f1bc46" />
      </div>
    </section>
  );
}

function ManagerDashboardPage() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/manager/dashboard')
      .then((payload) => setData(payload as ManagerDashboardData))
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load manager dashboard.'));
  }, []);

  if (message) {
    return (
      <section className="page">
        <div className="empty-state">
          <h2>Manager dashboard unavailable.</h2>
          <p>{message}</p>
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page">
        <div className="empty-state">
          <h2>Loading manager dashboard…</h2>
        </div>
      </section>
    );
  }

  const cards = [
    ['Users', data.kpis.total_users],
    ['Premium users', data.kpis.premium_users],
    ['Songs', data.kpis.total_songs],
    ['Artists', data.kpis.total_artists],
    ['Albums', data.kpis.total_albums],
    ['Successful payments', data.kpis.successful_payments],
    ['Revenue', `€${Number(data.kpis.total_revenue).toFixed(2)}`],
  ];

  return (
    <section className="page">
      <div className="page-heading animate-rise">
        <div>
          <div className="eyebrow">Manager / 001</div>
          <h1>Business<br /><em>dashboard.</em></h1>
        </div>
      </div>
      <p className="muted">Signed in as {data.manager.name} · {data.manager.role}</p>
      <div className="stat-grid animate-rise-2" style={{ marginTop: 24 }}>
        {cards.map(([label, value]) => (
          <div className="stat" key={String(label)}>
            <b>{String(value)}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="hairline" style={{ margin: '30px 0 18px' }} />
      <p className="muted">Use the Manager navigation to manage users, songs, and payment records.</p>
    </section>
  );
}

function ManagerUsersPage() {
  const [users, setUsers] = useState<ManagerUser[]>([]);
  const [message, setMessage] = useState('');

  const load = () =>
    apiRequest('/manager/users')
      .then((payload) => {
        const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).users : undefined;
        setUsers(
          Array.isArray(payload)
            ? payload as ManagerUser[]
            : Array.isArray(value)
              ? value as ManagerUser[]
              : [],
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load users.'));

  useEffect(() => {
    void load();
  }, []);

  const togglePremium = async (user: ManagerUser) => {
    try {
      const updated = await apiRequest(`/manager/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_premium: !user.is_premium }),
      }) as ManagerUser;

      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
      setMessage(`${user.username} is now ${updated.is_premium ? 'Premium' : 'Free'}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update user.');
    }
  };

  return (
    <section className="page">
      <div className="eyebrow">Manager / 002</div>
      <h1 className="section-title" style={{ margin: '15px 0 22px' }}>User<br /><em>management.</em></h1>
      {message && <p className="muted">{message}</p>}
      <div className="library-grid">
        {users.map((user) => (
          <article className="library-card" key={user.id}>
            <div className="cover-meta">
              <div>
                <h2>{user.name || user.username}</h2>
                <p>{user.email}</p>
                <p>{user.role} · {user.is_premium ? 'Premium' : 'Free'}</p>
              </div>
              <UserRound size={18} />
            </div>
            <div className="card-actions">
              {user.id > 0 && (
                <button className="solid-button small-button" onClick={() => void togglePremium(user)}>
                  {user.is_premium ? 'Set Free' : 'Grant Premium'}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {users.length === 0 && !message && <div className="empty-state"><h2>No users found.</h2></div>}
    </section>
  );
}

function ManagerSongsPage() {
  const [songs, setSongs] = useState<BackendSong[]>([]);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [mood, setMood] = useState<MoodName>('Neutral');

  const load = () =>
    apiRequest('/songs?limit=200')
      .then((payload) => {
        const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).songs : undefined;
        setSongs(
          Array.isArray(payload)
            ? payload as BackendSong[]
            : Array.isArray(value)
              ? value as BackendSong[]
              : [],
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load songs.'));

  useEffect(() => {
    void load();
  }, []);

  const beginEdit = (song: BackendSong) => {
    if (typeof song.id !== 'number') return;
    setEditingId(song.id);
    setTitle(song.title);
    setMood((moods.some((item) => item.name === song.mood) ? song.mood : 'Neutral') as MoodName);
    setMessage('');
  };

  const saveEdit = async (song: BackendSong) => {
    if (typeof song.id !== 'number') return;

    try {
      const updated = await apiRequest(`/manager/songs/${song.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim() || song.title,
          mood,
        }),
      }) as BackendSong;

      setSongs((current) => current.map((item) => item.id === song.id ? { ...item, ...updated } : item));
      setEditingId(null);
      setMessage(`Updated ${updated.title ?? song.title}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update song.');
    }
  };

  const removeSong = async (song: BackendSong) => {
    if (typeof song.id !== 'number') return;
    if (!window.confirm(`Delete "${song.title}"?`)) return;

    try {
      await apiRequest(`/manager/songs/${song.id}`, { method: 'DELETE' });
      setSongs((current) => current.filter((item) => item.id !== song.id));
      setMessage(`${song.title} deleted.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete song.');
    }
  };

  return (
    <section className="page">
      <div className="eyebrow">Manager / 003</div>
      <h1 className="section-title" style={{ margin: '15px 0 22px' }}>Song<br /><em>management.</em></h1>
      {message && <p className="muted">{message}</p>}
      <div className="result-section">
        {songs.map((song) => (
          <div className="result-row" key={song.id ?? song.title}>
            {editingId === song.id ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                <input
                  className="builder-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={{ flex: 1, minWidth: 220 }}
                />
                <select
                  className="builder-input"
                  value={mood}
                  onChange={(event) => setMood(event.target.value as MoodName)}
                >
                  {moods.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                </select>
                <button className="solid-button small-button" onClick={() => void saveEdit(song)}>Save</button>
                <button className="outline-button small-button" onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            ) : (
              <>
                <div className="result-row-main">
                  <strong>{song.title}</strong>
                  <small>{song.artist_name ?? 'Unknown artist'} / {song.mood ?? 'Neutral'}</small>
                </div>
                <div className="result-row-actions">
                  <button className="icon-button" onClick={() => beginEdit(song)} aria-label={`Edit ${song.title}`}>
                    <Pencil size={14} />
                  </button>
                  <button className="icon-button" onClick={() => void removeSong(song)} aria-label={`Delete ${song.title}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ManagerPaymentsPage() {
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiRequest('/manager/payments')
      .then((payload) => {
        const value = payload && typeof payload === 'object' ? (payload as Record<string, unknown>).payments : undefined;
        setPayments(
          Array.isArray(payload)
            ? payload as ManagerPayment[]
            : Array.isArray(value)
              ? value as ManagerPayment[]
              : [],
        );
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to load payments.'));
  }, []);

  return (
    <section className="page">
      <div className="eyebrow">Manager / 004</div>
      <h1 className="section-title" style={{ margin: '15px 0 22px' }}>Payment<br /><em>records.</em></h1>
      {message && <p className="muted">{message}</p>}
      <div className="result-section">
        {payments.map((payment) => (
          <div className="result-row" key={payment.id}>
            <div className="result-row-main">
              <strong>{payment.plan}</strong>
              <small>User #{payment.user_id} / {payment.status} / {new Date(payment.payment_date).toLocaleString()}</small>
            </div>
            <strong>{payment.currency} {Number(payment.amount).toFixed(2)}</strong>
          </div>
        ))}
      </div>
      {payments.length === 0 && !message && <div className="empty-state"><h2>No payment records.</h2></div>}
    </section>
  );
}

function ManagerPage({ onSignOut }: { onSignOut: () => void }) {
  const [dashboard, setDashboard] = useState<ManagerDashboardData | null>(null);
  const [users, setUsers] = useState<ManagerUser[]>([]);
  const [songs, setSongs] = useState<BackendSong[]>([]);
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'songs' | 'payments'>('overview');
  const [editingSongId, setEditingSongId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingMood, setEditingMood] = useState<MoodName>('Neutral');

  const loadManagerData = async () => {
    setMessage('');
    try {
      const [dashboardPayload, usersPayload, songsPayload, paymentsPayload] = await Promise.all([
        apiRequest('/manager/dashboard'),
        apiRequest('/manager/users'),
        apiRequest('/songs?limit=200'),
        apiRequest('/manager/payments'),
      ]);

      const usersValue = usersPayload && typeof usersPayload === 'object'
        ? (usersPayload as Record<string, unknown>).users
        : undefined;
      const songsValue = songsPayload && typeof songsPayload === 'object'
        ? (songsPayload as Record<string, unknown>).songs
        : undefined;
      const paymentsValue = paymentsPayload && typeof paymentsPayload === 'object'
        ? (paymentsPayload as Record<string, unknown>).payments
        : undefined;

      setDashboard(dashboardPayload as ManagerDashboardData);
      setUsers(
        Array.isArray(usersPayload)
          ? usersPayload as ManagerUser[]
          : Array.isArray(usersValue)
            ? usersValue as ManagerUser[]
            : [],
      );
      setSongs(
        Array.isArray(songsPayload)
          ? songsPayload as BackendSong[]
          : Array.isArray(songsValue)
            ? songsValue as BackendSong[]
            : [],
      );
      setPayments(
        Array.isArray(paymentsPayload)
          ? paymentsPayload as ManagerPayment[]
          : Array.isArray(paymentsValue)
            ? paymentsValue as ManagerPayment[]
            : [],
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load manager dashboard.');
    }
  };

  useEffect(() => {
    void loadManagerData();
  }, []);

  const togglePremium = async (user: ManagerUser) => {
    try {
      const updated = await apiRequest(`/manager/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_premium: !user.is_premium }),
      }) as ManagerUser;
      setUsers((current) => current.map((item) => item.id === user.id ? updated : item));
      setMessage(`${user.username} is now ${updated.is_premium ? 'Premium' : 'Free'}.`);
      const refreshed = await apiRequest('/manager/dashboard') as ManagerDashboardData;
      setDashboard(refreshed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update user.');
    }
  };

  const beginEditSong = (song: BackendSong) => {
    if (typeof song.id !== 'number') return;
    setEditingSongId(song.id);
    setEditingTitle(song.title);
    setEditingMood((moods.some((item) => item.name === song.mood) ? song.mood : 'Neutral') as MoodName);
    setMessage('');
  };

  const saveSong = async (song: BackendSong) => {
    if (typeof song.id !== 'number') return;
    try {
      const updated = await apiRequest(`/manager/songs/${song.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editingTitle.trim() || song.title,
          mood: editingMood,
        }),
      }) as BackendSong;
      setSongs((current) => current.map((item) => item.id === song.id ? { ...item, ...updated } : item));
      setEditingSongId(null);
      setMessage(`Updated ${updated.title ?? song.title}.`);
      const refreshed = await apiRequest('/manager/dashboard') as ManagerDashboardData;
      setDashboard(refreshed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update song.');
    }
  };

  const removeSong = async (song: BackendSong) => {
    if (typeof song.id !== 'number') return;
    if (!window.confirm(`Delete "${song.title}"?`)) return;
    try {
      await apiRequest(`/manager/songs/${song.id}`, { method: 'DELETE' });
      setSongs((current) => current.filter((item) => item.id !== song.id));
      setMessage(`${song.title} deleted.`);
      const refreshed = await apiRequest('/manager/dashboard') as ManagerDashboardData;
      setDashboard(refreshed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete song.');
    }
  };

  if (!dashboard) {
    return (
      <section className="page manager-dashboard-page">
        <div className="eyebrow">MOOSIC / MANAGER</div>
        <h1 className="display-title">Manager<br /><em>dashboard.</em></h1>
        {message ? <p className="muted">{message}</p> : <p className="muted">Loading business data…</p>}
        <button className="outline-button small-button" onClick={onSignOut}>Sign out</button>
      </section>
    );
  }

  const cards = [
    ['Users', dashboard.kpis.total_users],
    ['Premium users', dashboard.kpis.premium_users],
    ['Songs', dashboard.kpis.total_songs],
    ['Artists', dashboard.kpis.total_artists],
    ['Albums', dashboard.kpis.total_albums],
    ['Successful payments', dashboard.kpis.successful_payments],
    ['Revenue', `€${Number(dashboard.kpis.total_revenue).toFixed(2)}`],
  ];

  const tabButtonStyle = (active: boolean) => ({
    border: `1px solid ${active ? '#f1bc46' : 'rgba(247,239,205,.22)'}`,
    background: active ? 'rgba(241,188,70,.12)' : 'transparent',
    color: active ? '#f1bc46' : 'var(--app-foreground, #f7efcd)',
    padding: '10px 15px',
    cursor: 'pointer',
    fontSize: 12,
    letterSpacing: '.08em',
    textTransform: 'uppercase' as const,
  });

  return (
    <section className="page manager-dashboard-page">
      <div className="page-heading animate-rise">
        <div>
          <div className="eyebrow">MOOSIC / MANAGER</div>
          <h1>Business<br /><em>dashboard.</em></h1>
          <p className="muted">Signed in as {dashboard.manager.name} · manager</p>
        </div>
        <button className="outline-button small-button" onClick={onSignOut}>Sign out</button>
      </div>

      {message && <p className="muted" role="status">{message}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0 28px' }}>
        {([
          ['overview', 'Overview'],
          ['users', 'Users'],
          ['songs', 'Songs'],
          ['payments', 'Payments'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={tabButtonStyle(activeTab === tab)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div>
          <div className="stat-grid animate-rise-2">
            {cards.map(([label, value]) => (
              <div className="stat" key={String(label)}>
                <b>{String(value)}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="hairline" style={{ margin: '34px 0 24px' }} />
          <p className="muted">Use the tabs above to manage users, songs, and payment records.</p>
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <div className="eyebrow">Business records / 001</div>
          <h2 className="section-title" style={{ margin: '12px 0 18px' }}>User<br /><em>management.</em></h2>
          <div className="library-grid">
            {users.map((user) => (
              <article className="library-card" key={user.id}>
                <div className="cover-meta">
                  <div>
                    <h2>{user.name || user.username}</h2>
                    <p>{user.email}</p>
                    <p>{user.role} · {user.is_premium ? 'Premium' : 'Free'}</p>
                  </div>
                  <UserRound size={18} />
                </div>
                <div className="card-actions">
                  {user.role !== 'manager' && (
                    <button className="solid-button small-button" onClick={() => void togglePremium(user)}>
                      {user.is_premium ? 'Set Free' : 'Grant Premium'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {users.length === 0 && <div className="empty-state"><h2>No users found.</h2></div>}
        </div>
      )}

      {activeTab === 'songs' && (
        <div>
          <div className="eyebrow">Business records / 002</div>
          <h2 className="section-title" style={{ margin: '12px 0 18px' }}>Song<br /><em>management.</em></h2>
          <div className="result-section">
            {songs.map((song) => (
              <div className="result-row" key={song.id ?? song.title}>
                {editingSongId === song.id ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                    <input
                      className="builder-input"
                      value={editingTitle}
                      onChange={(event) => setEditingTitle(event.target.value)}
                      style={{ flex: 1, minWidth: 220 }}
                    />
                    <select
                      className="builder-input"
                      value={editingMood}
                      onChange={(event) => setEditingMood(event.target.value as MoodName)}
                    >
                      {moods.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
                    </select>
                    <button className="solid-button small-button" onClick={() => void saveSong(song)}>Save</button>
                    <button className="outline-button small-button" onClick={() => setEditingSongId(null)}>Cancel</button>
                    <div style={{ flexBasis: '100%', minWidth: 0 }}>
                      <SongAudioEditor songId={song.id} currentUrl={song.audio_url}
                        onError={setMessage}
                        onSaved={(updated) => {
                          setSongs((items) => items.map((item) => item.id === song.id ? { ...item, ...updated } : item));
                          setMessage(`Audio source updated for ${song.title}.`);
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="result-row-main">
                      <strong>{song.title}</strong>
                      <small>{song.artist_name ?? 'Unknown artist'} / {song.mood ?? 'Neutral'}</small>
                    </div>
                    <div className="result-row-actions">
                      <button className="icon-button" onClick={() => beginEditSong(song)} aria-label={`Edit ${song.title}`}>
                        <Pencil size={14} />
                      </button>
                      <button className="icon-button" onClick={() => void removeSong(song)} aria-label={`Delete ${song.title}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
          {songs.length === 0 && <div className="empty-state"><h2>No songs found.</h2></div>}
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          <div className="eyebrow">Business records / 003</div>
          <h2 className="section-title" style={{ margin: '12px 0 18px' }}>Payment<br /><em>records.</em></h2>
          <div className="result-section">
            {payments.map((payment) => (
              <div className="result-row" key={payment.id}>
                <div className="result-row-main">
                  <strong>{payment.plan}</strong>
                  <small>User #{payment.user_id} / {payment.status} / {new Date(payment.payment_date).toLocaleString()}</small>
                </div>
                <strong>{payment.currency} {Number(payment.amount).toFixed(2)}</strong>
              </div>
            ))}
          </div>
          {payments.length === 0 && <div className="empty-state"><h2>No payment records.</h2></div>}
        </div>
      )}
    </section>
  );
}
function Router({
  authUser,
  setAuthUser,
  authMode,
  setAuthMode,
}: {
  authUser: AuthUser | null;
  setAuthUser: (user: AuthUser | null) => void;
  authMode: AuthMode;
  setAuthMode: (mode: AuthMode) => void;
}) {
  const [location, setLocation] = useLocation();
  const [selectedMood, setSelectedMood] = useState<MoodName>('Neutral');
  const [browsingMood, setBrowsingMood] = useState<MoodName>('Neutral');
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [catalog, setCatalog] = useState<Track[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [playbackView, setPlaybackView] = useState<PlaybackView>({ playing: false, likedIds: new Set() });
  const galleryControls = useRef<GalleryPlayerControls | null>(null);
  const [library, setLibrary] = useState<Playlist[]>([]);
  const [deletedPlaylists, setDeletedPlaylists] = useState<Playlist[]>([]);
  const [notice, setNotice] = useState('');
  const [customTheme, setCustomTheme] = useState<string | null>(
    () => window.localStorage.getItem('moodsic-custom-theme')
  );
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus | null>(null);
  const [premiumBusy, setPremiumBusy] = useState(false);
  const [downloads, setDownloads] = useState<BackendDownload[]>([]);

  const numericUserId =
    authUser ? Number(authUser.id) : NaN;
  const downloadAccess = useRef({ userId: numericUserId, premium: Boolean(premiumStatus?.is_premium) });
  const downloadReadVersion = useRef(0);
  if (!Object.is(downloadAccess.current.userId, numericUserId) || downloadAccess.current.premium !== Boolean(premiumStatus?.is_premium)) {
    downloadAccess.current = { userId: numericUserId, premium: Boolean(premiumStatus?.is_premium) };
    downloadReadVersion.current += 1;
  }

  const refreshPremiumStatus = async () => {
    if (!authUser) {
      setPremiumStatus(null);
      return;
    }

    try {
      const payload = await apiRequest(
        '/premium/status'
      ) as PremiumStatus;

      setPremiumStatus(payload);

      if (!payload.is_premium) {
        setCustomTheme(null);
        window.localStorage.removeItem(
          'moodsic-custom-theme'
        );
      }
    } catch (error) {
      console.error(
        'Failed to load premium status:',
        error
      );
      setPremiumStatus({
        is_premium: false,
        plan: null,
        status: 'free',
      });
    }
  };

  useEffect(() => {
    void refreshPremiumStatus();
    const refreshOnFocus = () => void refreshPremiumStatus();
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [authUser?.id]);

  const cancelPremium = async () => {
    if (premiumBusy) return;

    setPremiumBusy(true);

    try {
      const result = await apiRequest(
        '/premium/cancel',
        { method: 'POST' }
      ) as { message?: string };

      await refreshPremiumStatus();
      setNotice(result.message ?? 'Premium cancelled. You can unlock it again whenever you like.');
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not cancel premium.'
      );
    } finally {
      setPremiumBusy(false);
    }
  };

  const refreshDownloads = async () => {
    const access = downloadAccess.current;
    if (!Object.is(access.userId, numericUserId)) return;
    if (
      !access.premium ||
      !Number.isFinite(numericUserId)
    ) {
      setDownloads([]);
      return;
    }

    const version = ++downloadReadVersion.current;
    try {
      const saved = await listSavedDownloads(requireSupabase(), access.userId);
      if (downloadAccess.current !== access || version !== downloadReadVersion.current) return;
      setDownloads(saved);
    } catch (error) {
      if (downloadAccess.current !== access || version !== downloadReadVersion.current) return;
      console.error(
        'Failed to load downloads:',
        error
      );

      setNotice('Could not load Downloads. Check your connection and try again.');
    }
  };

  useEffect(() => {
    if (premiumStatus?.is_premium) {
      void refreshDownloads();
    } else {
      setDownloads([]);
    }
  }, [
    premiumStatus?.is_premium,
    authUser?.id,
  ]);

  const downloadTrack = async (
    track: Track
  ) => {
    const access = downloadAccess.current;
    if (!Object.is(access.userId, numericUserId)) return;
    if (!access.premium) {
      setNotice(
        'Unlock with Premium to save tracks to your downloads library.'
      );
      setLocation('/premium');
      return;
    }

    if (
      !track.id ||
      !Number.isFinite(numericUserId)
    ) {
      setNotice(
        'This track cannot be saved to downloads.'
      );
      return;
    }

    if (
      downloads.some(
        (download) =>
          download.song_id === track.id
      )
    ) {
      setNotice(
        `${track.title} is already in your downloads library.`
      );
      return;
    }

    try {
      downloadReadVersion.current += 1;
      const saved = await saveDownload(requireSupabase(), access.userId, track.id);
      if (downloadAccess.current !== access) return;
      downloadReadVersion.current += 1;
      setDownloads(current => [saved, ...current.filter(item => item.song_id !== saved.song_id)]);

      setNotice(
        `${track.title} added to Downloads.`
      );
    } catch (error) {
      if (downloadAccess.current !== access) return;
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not save this track.'
      );
    }
  };

  const removeDownload = async (
    songId: number
  ) => {
    const access = downloadAccess.current;
    if (!Object.is(access.userId, numericUserId)) return;
    if (
      !access.premium ||
      !Number.isFinite(numericUserId)
    ) {
      setNotice(
        'Unlock with Premium to manage downloads.'
      );
      return;
    }

    try {
      downloadReadVersion.current += 1;
      await deleteSavedDownload(requireSupabase(), access.userId, songId);
      if (downloadAccess.current !== access) return;
      downloadReadVersion.current += 1;
      setDownloads(current => current.filter(item => item.song_id !== songId));

      setNotice(
        'Track removed from your downloads library.'
      );
    } catch (error) {
      if (downloadAccess.current !== access) return;
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not remove this download.'
      );
    }
  };

  const refreshPlaylistState = async (
    activeCatalog: Track[] = catalog
  ) => {
    if (!Number.isFinite(numericUserId)) {
      return;
    }

    const [
      savedPlaylists,
      recycledPlaylists,
    ] = await Promise.all([
      fetchUserPlaylists(
        numericUserId,
        activeCatalog,
        false
      ),
      fetchUserPlaylists(
        numericUserId,
        activeCatalog,
        true
      ),
    ]);

    setLibrary([
      ...savedPlaylists,
      ...buildDefaultPlaylists(activeCatalog),
    ]);

    setDeletedPlaylists(recycledPlaylists);
  };

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const songs = await supabaseApiRequest('/songs?limit=200', {}, false) as BackendSong[];

        const backendTracks = songs
          .filter((song) =>
            Boolean(
              song.title &&
              resolvePlaybackSource(song.audio_url) &&
              song.is_playable !== false
            )
          )
          .map(backendSongToTrack);

        if (!active) {
          return;
        }

        // Production playlists must be built only from backend tracks that
        // have a media source. The old fallback catalogue was
        // display-only and contained titles with no audio source.
        const activeCatalog = backendTracks;

        setCatalog(activeCatalog);
        setCatalogLoading(false);

        if (Number.isFinite(numericUserId)) {
          const [
            savedPlaylists,
            recycledPlaylists,
          ] = await Promise.all([
            fetchUserPlaylists(
              numericUserId,
              activeCatalog,
              false
            ),
            fetchUserPlaylists(
              numericUserId,
              activeCatalog,
              true
            ),
          ]);

          if (!active) {
            return;
          }

          setLibrary([
            ...savedPlaylists,
            ...buildDefaultPlaylists(
              activeCatalog
            ),
          ]);

          setDeletedPlaylists(
            recycledPlaylists
          );
        } else {
          setLibrary(
            buildDefaultPlaylists(
              activeCatalog
            )
          );
          setDeletedPlaylists([]);
        }
      } catch (error) {
        console.error(
          'Failed to load MOOSIC data:',
          error
        );

        if (active) {
          setCatalogLoading(false);
          setNotice(
            error instanceof Error
              ? error.message
              : 'MOOSIC could not load your saved data.'
          );
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, [authUser?.id]);

  const selectMood = (mood: MoodName) => {
    // Browsing a mood must not interrupt the song that is already playing.
    // The active player changes only after the user actually opens a playlist
    // or explicitly chooses another song.
    setBrowsingMood(mood);
    setLocation('/choose-playlist');
  };

  const openPlaylist = (playlist: Playlist) => {
    setSelectedMood(playlist.mood);
    setSelectedPlaylist(playlist);
    setLocation('/home');
  };

  const playTrack = (track: Track) => {
    setSelectedMood(track.mood);
    setSelectedPlaylist({
      id: `single-${track.id ?? track.title}-${Date.now()}`,
      name: track.title,
      mood: track.mood,
      count: 1,
      description: `Now playing ${track.artist}.`,
      trackTitles: [track.title],
    });
    setLocation('/home');
  };

  const playDownloadedTrack = (track: Track) => {
    // Saved entries include playback metadata, so they can start playing while
    // the main catalogue is still loading or temporarily unavailable.
    setCatalog(current => current.some(item => item.id === track.id) ? current : [...current, track]);
    playTrack(track);
  };

  const signOut = async () => {
    const { error } = await requireSupabase().auth.signOut({ scope: 'local' });
    if (error) { setNotice(error.message); return; }
    clearAuthSession();
    setAuthUser(null);
    setAuthMode('login');
    setSelectedPlaylist(null);
    setBrowsingMood('Neutral');
    setDeletedPlaylists([]);
    setLibrary(
      buildDefaultPlaylists(catalog)
    );
    setLocation('/');
  };

  const createPlaylist = async (
    playlist: Playlist
  ) => {
    if (!Number.isFinite(numericUserId)) {
      setNotice(
        'Please sign in again before creating a playlist.'
      );
      return;
    }

    try {
      const createdPayload = await apiRequest(
        `/users/${numericUserId}/playlists`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: playlist.name,
            description:
              encodePlaylistDescription(
                playlist.description,
                playlist.mood
              ),
            cover_url: null,
          }),
        }
      );

      let playlistId =
        backendPlaylistId(createdPayload);

      if (!playlistId) {
        const activePayload = await apiRequest(
          `/users/${numericUserId}/playlists`
        );

        const rawPlaylists = unwrapArray(
          activePayload,
          ['playlists', 'items', 'results', 'data']
        );

        const matching = [...rawPlaylists]
          .reverse()
          .find((raw) => {
            if (!raw || typeof raw !== 'object') {
              return false;
            }

            const record =
              raw as Record<string, unknown>;

            return (
              record.name === playlist.name ||
              (
                record.playlist &&
                typeof record.playlist === 'object' &&
                (
                  record.playlist as Record<string, unknown>
                ).name === playlist.name
              )
            );
          });

        playlistId =
          backendPlaylistId(matching);
      }

      if (!playlistId) {
        throw new Error(
          'The playlist was created, but MOOSIC could not determine its ID.'
        );
      }

      for (const title of playlist.trackTitles) {
        const track = catalog.find(
          (candidate) =>
            candidate.title === title
        );

        if (!track?.id) {
          continue;
        }

        await apiRequest(
          `/playlists/${playlistId}/songs`,
          {
            method: 'POST',
            body: JSON.stringify({
              song_id: track.id,
              user_id: numericUserId,
            }),
          }
        );
      }

      await refreshPlaylistState();

      setNotice(
        `${playlist.name} is now saved to your account.`
      );
    } catch (error) {
      console.error(
        'Failed to create playlist:',
        error
      );

      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not create the playlist.'
      );
    }
  };

  const deletePlaylist = async (
    playlist: Playlist
  ) => {
    if (!playlist.backendId) {
      setNotice(
        'Built-in mood playlists stay in MOOSIC.'
      );
      return;
    }

    try {
      await apiRequest(
        `/playlists/${playlist.backendId}`,
        {
          method: 'DELETE',
        }
      );

      if (
        selectedPlaylist?.backendId ===
        playlist.backendId
      ) {
        setSelectedPlaylist(null);
      }

      await refreshPlaylistState();

      setNotice(
        `${playlist.name} moved to Restore.`
      );
    } catch (error) {
      console.error(
        'Failed to delete playlist:',
        error
      );

      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not delete the playlist.'
      );
    }
  };

  const restorePlaylist = async (
    playlist: Playlist
  ) => {
    if (!playlist.backendId) {
      return;
    }

    try {
      await apiRequest(
        `/playlists/${playlist.backendId}/restore`,
        {
          method: 'POST',
        }
      );

      await refreshPlaylistState();

      setNotice(
        `${playlist.name} is back on your shelf.`
      );
    } catch (error) {
      console.error(
        'Failed to restore playlist:',
        error
      );

      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not restore the playlist.'
      );
    }
  };

  const restoreAllPlaylists = async () => {
    const restorable =
      deletedPlaylists.filter(
        (playlist) => playlist.backendId
      );

    try {
      for (const playlist of restorable) {
        await apiRequest(
          `/playlists/${playlist.backendId}/restore`,
          {
            method: 'POST',
          }
        );
      }

      await refreshPlaylistState();

      setNotice(
        'Every saved record is back on your shelf.'
      );
    } catch (error) {
      console.error(
        'Failed to restore all playlists:',
        error
      );

      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not restore all playlists.'
      );
    }
  };

  const addTrackToPlaylist = async (
    playlistId: string,
    track: Track
  ) => {
    const playlist = library.find(
      (candidate) =>
        candidate.id === playlistId
    );

    if (
      !playlist?.backendId ||
      !track.id ||
      !Number.isFinite(numericUserId)
    ) {
      setNotice(
        'Create a saved playlist before adding songs.'
      );
      return;
    }

    if (
      playlist.trackTitles.includes(
        track.title
      )
    ) {
      setNotice(
        `${track.title} is already in ${playlist.name}.`
      );
      return;
    }

    try {
      await apiRequest(
        `/playlists/${playlist.backendId}/songs`,
        {
          method: 'POST',
          body: JSON.stringify({
            song_id: track.id,
            user_id: numericUserId,
          }),
        }
      );

      await refreshPlaylistState();

      setNotice(
        `${track.title} added to ${playlist.name}.`
      );
    } catch (error) {
      console.error(
        'Failed to add song to playlist:',
        error
      );

      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not add the song.'
      );
    }
  };

  const moodTitles: Record<MoodName, string> = { Happy: 'The good days', Sad: 'After the rain', Neutral: 'In between', Angry: 'Let it out', Exhausted: 'Low battery' };
  const moodColors: Record<MoodName, string> = { Happy: '#d3ae5f', Sad: '#526fbc', Neutral: '#8caa93', Angry: '#c56c4c', Exhausted: '#91a6b1' };
  const moodEditions: MoodEdition[] = MOOD_ORDER.map(name => ({ name, loading: catalogLoading, art: moodFor(name).art, color: moodColors[name], title: moodTitles[name], description: moodFor(name).description, tracks: catalog.filter(track => track.mood === name) }));
  const navigateMood = (mood: MoodName) => {
    const navigate = () => { flushSync(() => setLocation(`/mood/${mood.toLowerCase()}`)); window.scrollTo({ top: 0, behavior: 'instant' }); };
    // The destination disc keeps its visual identity while the persistent player stays mounted.
    const transitions = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
    if (transitions.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const transition = transitions.startViewTransition(navigate);
      void transition.finished.catch(() => {});
    } else navigate();
  };
  const playMood = (edition: MoodEdition, track?: Track) => {
    setSelectedMood(edition.name);
    setSelectedPlaylist({ id: `play-mood-${edition.name}-${Date.now()}`, name: edition.title, mood: edition.name,
      count: edition.tracks.length, description: edition.description, trackTitles: edition.tracks.map(item => item.title), requestedTrackTitle: track?.title });
  };

  const downloadedSongIds = new Set(
    downloads.map(
      (download) => download.song_id
    )
  );

  const updateProfile = async (
    name: string,
    profileNote: string,
    username?: string
  ): Promise<boolean> => {
    try {
      const payload = await apiRequest('/me', {
        method: 'PUT',
        body: JSON.stringify({
          name,
          profile_note: profileNote,
          ...(username ? { username } : {}),
        }),
      }) as { user?: unknown };

      const updatedUser = normalizeBackendUser(
        payload.user ?? payload
      );

      const session = getAuthenticatedSession();
      storeAuthSession({
        user: updatedUser,
        token: session.token,
      });

      setAuthUser(updatedUser);
      setNotice('Your profile has been updated.');
      return true;
    } catch (error) {
      console.error('Failed to update profile:', error);
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not update your profile.'
      );
      return false;
    }
  };


  return (
    <>
      {authUser?.role === 'manager' ? (
        <ManagerPage onSignOut={signOut} />
      ) : (
      <Shell
        authUser={authUser as AuthUser}
        isPremium={Boolean(premiumStatus?.is_premium)}
        appBackground={
          customTheme ??
          (
            location === '/' || location === '/choose-playlist'
              ? moodFor(browsingMood).color
              : moodFor(selectedMood).color
          )
        }
      >
        {notice && (
          <div className="notice notice-in" role="status" data-testid="status-notice">
            <span>{notice}</span>
            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss feedback"
              data-testid="button-dismiss-notice"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <ErrorBoundary resetKey={location}>
          {/*
            Global persistent player:
            - never unmounts while the user is signed in
            - shows the full player on /home
            - shows a compact mini-player everywhere else
            - browsing/opening another playlist does not replace playback
          */}
          <HomePage
            selectedMood={selectedMood}
            selectedPlaylist={selectedPlaylist}
            setNotice={setNotice}
            tracks={catalog}
            userId={numericUserId}
            compact={location !== '/home'}
            isPremium={Boolean(premiumStatus?.is_premium)}
            downloadedSongIds={downloadedSongIds}
            onDownload={downloadTrack}
            onPlaybackView={setPlaybackView}
            galleryControls={galleryControls}
          />

          <Switch>
            <Route path="/">
              <MoodGalleryHome editions={moodEditions} playback={playbackView} onEnter={navigateMood} />
            </Route>

            <Route path="/mood/:slug">{params => {
              const moodName = moodFromSlug(params.slug);
              const edition = moodEditions.find(item => item.name === moodName);
              return edition ? <MoodPlaylistPage key={edition.name} edition={edition} editions={moodEditions} playback={playbackView}
                onPlay={track => playMood(edition, track)} onToggle={() => galleryControls.current?.toggle()}
                onFavorite={track => galleryControls.current?.favorite(track)} onNavigate={navigateMood} />
                : <section className="page"><h1>Mood not found</h1><Link href="/">Explore all moods</Link></section>;
            }}</Route>

            <Route path="/choose-playlist">
              <PlaylistChoicePage
                moodName={browsingMood}
                library={library}
                choosePlaylist={openPlaylist}
              />
            </Route>

            <Route path="/home">
              <></>
            </Route>

            <Route path="/playlists">
              <PlaylistsPage
                library={library}
                tracks={catalog}
                openPlaylist={openPlaylist}
                setNotice={setNotice}
                onCreate={createPlaylist}
                onDelete={deletePlaylist}
                isPremium={Boolean(premiumStatus?.is_premium)}
              />
            </Route>

            <Route path="/restore">
              <RestorePage
                tracks={catalog}
                deletedPlaylists={deletedPlaylists}
                setNotice={setNotice}
                onRestore={restorePlaylist}
                onRestoreAll={restoreAllPlaylists}
              />
            </Route>

            <Route path="/search">
              <SearchPage
                library={library}
                tracks={catalog}
                playTrack={playTrack}
                openPlaylist={openPlaylist}
                setNotice={setNotice}
                addTrackToPlaylist={addTrackToPlaylist}
                isPremium={Boolean(premiumStatus?.is_premium)}
                downloadedSongIds={downloadedSongIds}
                onDownload={downloadTrack}
              />
            </Route>

            <Route path="/downloads">
              <DownloadsPage
                isPremium={Boolean(premiumStatus?.is_premium)}
                downloads={downloads}
                tracks={catalog}
                playTrack={playDownloadedTrack}
                onRemove={removeDownload}
              />
            </Route>

            <Route path="/theme">
              <CustomThemePage
                selectedColor={customTheme}
                setSelectedColor={setCustomTheme}
                setNotice={setNotice}
                isPremium={Boolean(premiumStatus?.is_premium)}
              />
            </Route>

            <Route path="/premium">
              <PremiumPage
                premiumStatus={premiumStatus}
                onCancel={cancelPremium}
                onMembershipChange={refreshPremiumStatus}
                isBusy={premiumBusy}
              />
            </Route>

            <Route path="/profile">
              <ProfilePage
                authUser={authUser as AuthUser}
                setNotice={setNotice}
                onSignOut={signOut}
                onSaveProfile={updateProfile}
              />
            </Route>


            {authUser?.role === 'manager' && (
              <Route path="/manager">
                <ManagerPage onSignOut={signOut} />
              </Route>
            )}
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </ErrorBoundary>
      </Shell>
      )}
    </>
  );
}

function NotFound() {
  return <section className="page"><div className="eyebrow">404 / wrong side</div><h1 className="display-title">This record<br /><em>isn’t here.</em></h1><Link href="/" className="solid-button" data-testid="link-not-found-home">Back to the feeling picker</Link></section>;
}

function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => readAuthSession()?.user ?? null);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ButtonGlow />
      <AuthGate authUser={authUser} setAuthUser={setAuthUser} authMode={authMode} setAuthMode={setAuthMode}>
        <Router
          key={authUser?.id ?? 'signed-out'}
          authUser={authUser}
          setAuthUser={setAuthUser}
          authMode={authMode}
          setAuthMode={setAuthMode}
        />
      </AuthGate>
    </WouterRouter>
  );
}

export default App;
