import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4';
import { BillingError, billingPlans, createBilling, premiumStatus } from './billing.ts';

// The browser receives only a publishable/anon key. Every private query uses the
// caller's verified JWT, so database RLS remains effective inside this function.
const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const billingEnv = (name: string) => Deno.env.get(name);
const billing = createBilling({ env: billingEnv, admin: () => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) throw new BillingError(503, 'Secure payments are not configured yet.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
} });
const songSelect = '*,artists(name),albums(title)';
type Row = Record<string, any>;
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new ApiError(status, message); };
const integer = (value: unknown, name: string, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) fail(422, `${name} must be an integer between ${min} and ${max}.`);
  return number;
};
const textValue = (value: unknown, name: string, max = 200, allowEmpty = false) => {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.trim().length > max) fail(422, `${name} must be ${allowEmpty ? 'at most' : 'between 1 and'} ${max} characters.`);
  return (value as string).trim();
};
const bool = (value: unknown, name: string) => typeof value === 'boolean' ? value : fail(422, `${name} must be a boolean.`);
function mediaURL(value: unknown, name: string): string | null {
  if (value === null || value === '') return null;
  const input = textValue(value, name, 2048);
  try {
    const parsed = new URL(input);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) throw new Error();
    return input;
  } catch { return fail(422, `${name} must be an HTTPS URL.`); }
}
async function run(query: any): Promise<any> {
  const { data, error } = await query;
  if (error) {
    if (error.code === '23505') fail(409, 'This item already exists. Choose a different username or title.');
    if (error.code === '23503') fail(404, 'The referenced item does not exist.');
    if (['23514', '22023', '22P02'].includes(error.code)) fail(422, 'One or more values are invalid.');
    if (error.code === '42501') fail(403, 'You do not have access to this resource.');
    if (['PGRST116', 'P0002'].includes(error.code)) fail(404, 'Resource not found.');
    console.error('Database request failed', error.code);
    fail(500, 'The request could not be completed. Please try again.');
  }
  return data;
}
const song = (row: Row): Row => {
  const { artists, albums, ...fields } = row;
  return { ...fields, artist_name: artists?.name ?? null, album_title: albums?.title ?? null, is_playable: fields.is_playable ?? Boolean(fields.audio_url) };
};
const profile = (row: Row) => {
  const { auth_user_id: _privateId, ...fields } = row;
  return { ...fields, user_id: row.id };
};
const playlist = (row: Row) => {
  const { playlist_songs, ...fields } = row;
  return { ...fields, song_count: playlist_songs?.[0]?.count ?? 0 };
};
const inferMood = (item: Row): string => {
  if (['Happy', 'Neutral', 'Sad', 'Exhausted', 'Angry'].includes(item.mood)) return item.mood;
  const genre = (item.genre || '').toLowerCase();
  if (/ballad|romance|r&b|soul/.test(genre)) return 'Sad';
  if (/hip hop|dancehall|alternative rock/.test(genre)) return 'Angry';
  if (/classical|ambient|acoustic/.test(genre)) return 'Exhausted';
  if (/synthwave|indie pop|electropop|pop rock/.test(genre)) return 'Neutral';
  return /dance pop|house|funk|latin pop|dance|pop/.test(genre) ? 'Happy' : 'Neutral';
};
async function body(req: Request): Promise<Row> {
  const raw = await req.text();
  if (raw.length > 65536) fail(413, 'Request is too large.');
  try {
    const parsed = JSON.parse(raw || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch { return fail(400, 'A JSON object is required.'); }
}
function songInput(input: Row, partial = false) {
  const output: Row = {};
  for (const key of ['title', 'genre', 'mood', 'language']) {
    if (input[key] !== undefined) output[key] = input[key] === null && !['title', 'language'].includes(key) ? null : textValue(input[key], key);
  }
  if (!partial && !output.title) fail(422, 'A song title is required.');
  for (const key of ['artist_id', 'album_id']) if (input[key] !== undefined) output[key] = input[key] === null ? null : integer(input[key], key);
  if (input.duration !== undefined) output.duration = input.duration === null ? null : integer(input.duration, 'duration', 0, 86400);
  for (const key of ['audio_url', 'cover_url']) if (input[key] !== undefined) output[key] = mediaURL(input[key], key);
  if (input.is_playable !== undefined) output.is_playable = input.is_playable === null ? null : bool(input.is_playable, 'is_playable');
  if ('audio_url' in output) { output.is_playable = output.audio_url ? null : false; output.audio_checked_at = null; }
  return output;
}
function playlistInput(input: Row, partial = false) {
  const output: Row = {};
  if (input.name !== undefined || !partial) output.name = textValue(input.name, 'name');
  if (input.cover_url !== undefined) output.cover_url = mediaURL(input.cover_url, 'cover_url');
  if (input.description !== undefined) output.description = input.description === null ? null : textValue(input.description, 'description', 2000, true);
  return output;
}
async function count(db: SupabaseClient, table: string, filter?: [string, unknown]) {
  let query = db.from(table).select('id', { head: true, count: 'exact' });
  if (filter) query = query.eq(filter[0], filter[1]);
  const result = await query;
  if (result.error) fail(500, 'Could not load statistics.');
  return result.count ?? 0;
}
async function allRows(db: SupabaseClient, table: string, selection = '*', configure = (query: any) => query): Promise<Row[]> {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await run(configure(db.from(table).select(selection)).order('id').range(offset, offset + 999));
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  const origin = req.headers.get('Origin');
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(item => item.trim()).filter(Boolean);
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed.length ? (origin && allowed.includes(origin) ? origin : allowed[0]) : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Vary': 'Origin',
  };
  const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (origin && allowed.length && !allowed.includes(origin)) return respond({ detail: 'Origin is not allowed.' }, 403);
  try {
    if (!url || !anonKey) fail(503, 'Supabase project configuration is incomplete.');
    const requestURL = new URL(req.url);
    const path = requestURL.pathname.replace(/^\/functions\/v1\/api(?=\/|$)/, '').replace(/^\/api(?=\/|$)/, '').replace(/\/$/, '') || '/';
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const method = req.method;
    if (path === '/premium/webhook' && method === 'POST') return respond(await billing.webhook(req));
    if (path === '/premium/plans' && method === 'GET') {
      const publicBillingDB = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const demoEnabled = await run(publicBillingDB.rpc('demo_premium_available'));
      return respond({ ...billingPlans(billingEnv), demo_enabled: demoEnabled, demo: { enabled: demoEnabled, mode: 'simulation', charged: false } });
    }
    const limit = integer(requestURL.searchParams.get('limit') ?? 200, 'limit', 1, 200);
    const offset = integer(requestURL.searchParams.get('offset') ?? 0, 'offset', 0);
    const publicDB = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (method === 'GET') {
      if (path === '/') return respond({ status: 'ok', service: 'MOOSIC Supabase API' });
      if (parts[0] === 'songs') {
        if (parts.length === 1) return respond((await run(publicDB.from('songs').select(songSelect).order('id').range(offset, offset + limit - 1))).map(song));
        if (parts.length === 2 && ['genres', 'languages'].includes(parts[1])) {
          const field = parts[1] === 'genres' ? 'genre' : 'language';
          const rows = await allRows(publicDB, 'songs', `id,${field}`);
          return respond({ [parts[1]]: [...new Set(rows.map(row => row[field]).filter(Boolean))].sort() });
        }
        if (parts[1] === 'search' && parts.length === 2) {
          const query = textValue(requestURL.searchParams.get('q'), 'q', 200).toLowerCase();
          const rows = (await allRows(publicDB, 'songs', songSelect)).map(song);
          return respond(rows.filter(row => [row.title, row.artist_name, row.genre, row.language].some(value => String(value || '').toLowerCase().includes(query))).slice(0, limit));
        }
        if (parts.length === 3 && ['genre', 'mood', 'language'].includes(parts[1])) {
          const query = publicDB.from('songs').select(songSelect).ilike(parts[1], parts[2].replace(/[%_]/g, '\\$&')).order('id').limit(limit);
          return respond((await run(query)).map(song));
        }
        if (parts.length === 2 || (parts.length === 3 && parts[2] === 'play')) {
          const row = song(await run(publicDB.from('songs').select(songSelect).eq('id', integer(parts[1], 'song_id')).single()));
          return respond(parts[2] === 'play' ? { ...row, song_id: row.id } : row);
        }
      }
      if (parts[0] === 'artists' && parts.length <= 2) {
        if (parts.length === 1) return respond(await allRows(publicDB, 'artists'));
        const id = integer(parts[1], 'artist_id');
        const [artist, albums, songs] = await Promise.all([
          run(publicDB.from('artists').select('*').eq('id', id).single()),
          run(publicDB.from('albums').select('*,songs(*,artists(name),albums(title))').eq('artist_id', id)),
          run(publicDB.from('songs').select(songSelect).eq('artist_id', id).order('id').limit(5)),
        ]);
        return respond({ ...artist, albums: albums.map((row: Row) => ({ ...row, artist_name: artist.name, songs: row.songs.map(song) })), popular_songs: songs.map(song) });
      }
      if (parts[0] === 'albums' && parts.length <= 2) {
        let query = publicDB.from('albums').select('*,artists(name),songs(*,artists(name),albums(title))').order('id');
        if (parts.length === 2) query = query.eq('id', integer(parts[1], 'album_id'));
        const rows = (await run(query)).map((row: Row) => { const { artists, songs, ...fields } = row; return { ...fields, artist_name: artists?.name, songs: songs.map(song) }; });
        if (parts.length === 2 && !rows.length) fail(404, 'Album not found.');
        return respond(parts.length === 2 ? rows[0] : rows);
      }
      if (path === '/library') {
        const rows = (await allRows(publicDB, 'songs', songSelect)).map(song);
        const group = (field: string) => Object.fromEntries([...new Set(rows.map(row => row[field]).filter(Boolean))].sort().map(value => [value, rows.filter(row => row[field] === value)]));
        return respond({ featured: rows.slice(0, 8), genres: group('genre'), languages: group('language') });
      }
    }
    if (path === '/login' || (path === '/users' && method === 'POST')) fail(410, 'Use Supabase Auth to sign in or create an account.');
    if (path === '/manager/register') fail(403, 'Manager accounts must be granted by the project administrator.');
    const authorization = req.headers.get('Authorization') || '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) fail(401, 'Please sign in to continue.');
    const db = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: authError } = await db.auth.getUser(token);
    if (authError || !userData.user) fail(401, 'Your session expired. Please sign in again.');
    const me = await run(db.from('profiles').select('*').eq('auth_user_id', userData.user!.id).single());
    const input = ['POST', 'PUT', 'PATCH'].includes(method) ? await body(req) : {};
    if (path === '/me') {
      if (method === 'GET') return respond(profile(me));
      if (method === 'PUT') {
        const updates: Row = {};
        for (const [key, maximum] of [['name', 100], ['username', 32], ['profile_note', 180]] as const) if (input[key] !== undefined) updates[key] = textValue(input[key], key, maximum, key === 'profile_note');
        if (!Object.keys(updates).length) return respond(profile(me));
        return respond(profile(await run(db.from('profiles').update(updates).eq('id', me.id).select().single())));
      }
    }
    if (path === '/premium/status' && method === 'GET') return respond(await premiumStatus(db, billingEnv));
    if (path === '/premium/demo/activate' && method === 'POST') {
      // Demo card validation is entirely local to the browser. Never receive or
      // persist a card number, CVV, expiry, or client-selected account identity.
      if (Object.keys(input).length) fail(422, 'Demo checkout accepts no payment details. Submit an empty request.');
      const status = await run(db.rpc('activate_demo_premium'));
      return respond({ ...status, message: 'Demo Premium unlocked. No payment was charged.' });
    }
    if (path === '/premium/checkout' && method === 'POST') return respond(await billing.checkout(me, input), 201);
    if (path === '/premium/verify' && method === 'POST') return respond(await billing.verify(me, input, db));
    if (path === '/premium/subscribe' && method === 'POST') fail(410, 'Use the secure Premium checkout to purchase a pass.');
    if (path === '/premium/cancel' && method === 'POST') {
      await run(db.rpc('cancel_premium'));
      const status = await premiumStatus(db, billingEnv);
      return respond({ ...status, message: status.is_premium ? 'Demo and complimentary access ended. Your paid pass keeps its remaining time.' : 'Premium cancelled. You can unlock demo Premium again at any time.' });
    }
    if (parts[0] === 'manager' || parts[0] === 'admin' || path === '/users' || (['/artists', '/albums', '/songs'].includes(path) && method === 'POST')) {
      if (me.role !== 'manager') fail(403, 'Manager access required.');
      if (path === '/manager/dashboard' && method === 'GET') {
        const [total_users, premium_users, total_songs, total_artists, total_albums, successful_payments, paymentRows] = await Promise.all([
          count(db, 'profiles'), run(db.rpc('manager_premium_count')), count(db, 'songs'), count(db, 'artists'), count(db, 'albums'), count(db, 'payments', ['status', 'success']), allRows(db, 'payments', 'id,amount', query => query.eq('status', 'success')),
        ]);
        return respond({ manager: { user_id: me.id, name: me.name, role: me.role }, kpis: { total_users, premium_users, total_songs, total_artists, total_albums, successful_payments, total_revenue: Math.round(paymentRows.reduce((sum, row) => sum + Number(row.amount), 0) * 100) / 100 } });
      }
      if ((path === '/manager/users' || path === '/users') && method === 'GET') return respond((await allRows(db, 'profiles')).map(profile));
      if (parts[1] === 'users' && parts.length === 3 && ['PATCH', 'PUT'].includes(method)) {
        if (Object.keys(input).some(key => key !== 'is_premium')) fail(422, 'Only Premium access can be changed here. Account identities are managed by Supabase Auth.');
        return respond(profile(await run(db.rpc('manager_set_premium', { target_user_id: integer(parts[2], 'user_id'), enabled: bool(input.is_premium, 'is_premium') }))));
      }
      if (path === '/manager/payments' && method === 'GET') return respond({ payments: (await allRows(db, 'payments', '*,profiles(email)')).map(row => ({ ...row, payment_id: row.id, user_email: row.profiles?.email })) });
      if (path === '/artists' && method === 'POST') return respond(await run(db.from('artists').insert({ name: textValue(input.name, 'name'), image_url: input.image_url === undefined ? null : mediaURL(input.image_url, 'image_url') }).select().single()), 201);
      if (path === '/albums' && method === 'POST') return respond(await run(db.from('albums').insert({ title: textValue(input.title, 'title'), artist_id: integer(input.artist_id, 'artist_id'), cover_url: input.cover_url === undefined ? null : mediaURL(input.cover_url, 'cover_url'), release_date: input.release_date === undefined ? null : textValue(input.release_date, 'release_date', 30) }).select().single()), 201);
      if (['/songs', '/manager/songs'].includes(path) && method === 'POST') {
        const created = await run(db.from('songs').insert(songInput(input)).select(songSelect).single());
        return respond({ ...song(created), song_id: created.id, message: 'Song created.' }, 201);
      }
      if (parts[1] === 'songs' && parts.length === 3) {
        const id = integer(parts[2], 'song_id');
        if (method === 'PUT') {
          const updated = await run(db.from('songs').update(songInput(input, true)).eq('id', id).select(songSelect).single());
          return respond({ ...song(updated), song_id: id, message: 'Song updated.' });
        }
        if (method === 'DELETE') {
          await run(db.from('songs').delete().eq('id', id).select('id').single());
          return respond({ song_id: id, message: 'Song deleted.' });
        }
      }
      if (parts[0] === 'admin' && parts[1] === 'songs' && parts[3] === 'audio-url' && method === 'PUT') {
        const id = integer(parts[2], 'song_id');
        return respond(song(await run(db.from('songs').update(songInput({ audio_url: input.audio_url }, true)).eq('id', id).select(songSelect).single())));
      }
    }
    if (parts[0] === 'playlists' && parts.length >= 2) {
      const id = integer(parts[1], 'playlist_id');
      const owned = await run(db.from('playlists').select('*').eq('id', id).eq('user_id', me.id).single());
      if (parts[2] === 'restore' && parts.length === 3 && method === 'POST') {
        await run(db.from('playlists').update({ is_deleted: false, deleted_at: null }).eq('id', id));
        return respond({ message: 'Playlist restored.', playlist_id: id });
      }
      if (parts.length === 2 && method === 'DELETE') {
        await run(db.from('playlists').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', id));
        return respond({ message: 'Playlist moved to recycle bin.', playlist_id: id });
      }
      if (owned.is_deleted) fail(404, 'Restore this playlist before accessing it.');
      if (parts.length === 2 && method === 'PUT') return respond(playlist(await run(db.from('playlists').update(playlistInput(input, true)).eq('id', id).select('*,playlist_songs(count)').single())));
      if (parts[2] === 'songs') {
        if (parts.length === 3 && method === 'GET') return respond((await run(db.from('playlist_songs').select('*,songs(*,artists(name),albums(title))').eq('playlist_id', id).order('position').order('id'))).map((row: Row) => ({ playlist_song_id: row.id, playlist_id: id, song: song(row.songs) })));
        if (parts.length === 3 && method === 'POST') {
          if (input.user_id !== undefined && integer(input.user_id, 'user_id') !== me.id) fail(403, 'You can only modify your own playlists.');
          const last = await run(db.from('playlist_songs').select('position').eq('playlist_id', id).order('position', { ascending: false }).limit(1));
          const row = await run(db.from('playlist_songs').insert({ playlist_id: id, song_id: integer(input.song_id, 'song_id'), position: (last[0]?.position ?? -1) + 1 }).select().single());
          return respond({ message: 'Song added to playlist.', playlist_id: id, song_id: row.song_id });
        }
        if (parts[3] === 'order' && method === 'PUT') {
          if (!Array.isArray(input.song_ids) || input.song_ids.length > 5000) fail(422, 'song_ids must be an array.');
          const ids = input.song_ids.map((value: unknown) => integer(value, 'song_id'));
          await run(db.rpc('reorder_playlist', { target_playlist_id: id, song_ids: ids }));
          return respond({ message: 'Playlist order saved.', playlist_id: id, song_ids: ids });
        }
        if (parts.length === 4 && method === 'DELETE') {
          await run(db.from('playlist_songs').delete().eq('playlist_id', id).eq('song_id', integer(parts[3], 'song_id')).select('id').single());
          return respond({ message: 'Song removed from playlist.', playlist_id: id });
        }
      }
    }
    if (parts[0] === 'users' && parts.length >= 3) {
      const owner = integer(parts[1], 'user_id');
      if (owner !== me.id) fail(403, 'You can only access your own library.');
      const resource = parts[2];
      if (resource === 'playlists') {
        if (method === 'GET' && (parts.length === 3 || parts[3] === 'recycle-bin')) return respond((await run(db.from('playlists').select('*,playlist_songs(count)').eq('user_id', owner).eq('is_deleted', parts[3] === 'recycle-bin').order('id', { ascending: false }))).map(playlist));
        if (method === 'POST' && parts.length === 3) {
          const created = await run(db.from('playlists').insert({ ...playlistInput(input), user_id: owner }).select().single());
          return respond({ ...created, playlist_id: created.id, message: 'Playlist created.' }, 201);
        }
      }
      if (resource === 'liked-songs') {
        if (method === 'GET' && parts.length === 3) return respond((await run(db.from('liked_songs').select('*,songs(*,artists(name),albums(title))').eq('user_id', owner).order('id', { ascending: false }))).map((row: Row) => ({ liked_song_id: row.id, user_id: owner, song: song(row.songs) })));
        if (method === 'POST' && parts.length === 3) {
          const id = integer(input.song_id, 'song_id');
          await run(db.from('liked_songs').upsert({ user_id: owner, song_id: id }, { onConflict: 'user_id,song_id', ignoreDuplicates: true }));
          return respond({ message: 'Song liked.', user_id: owner, song_id: id });
        }
        if (method === 'DELETE' && parts.length === 4) {
          await run(db.from('liked_songs').delete().eq('user_id', owner).eq('song_id', integer(parts[3], 'song_id')));
          return respond({ message: 'Song unliked.' });
        }
      }
      if (resource === 'downloads') {
        if (!await run(db.rpc('has_premium'))) fail(403, 'Premium access is required.');
        const download = (row: Row) => ({ id: row.id, song_id: row.song_id, title: row.songs?.title || '', artist: row.songs?.artists?.name || '', downloaded_at: row.downloaded_at, audio_url: row.songs?.audio_url });
        if (method === 'GET' && parts.length === 3) return respond((await run(db.from('downloads').select('*,songs(*,artists(name))').eq('user_id', owner).order('downloaded_at', { ascending: false }))).map(download));
        if (method === 'POST' && parts.length === 3) {
          const id = integer(input.song_id, 'song_id');
          const track = await run(db.from('songs').select('audio_url').eq('id', id).single());
          // YouTube embeds cannot be saved as an audio file by this application.
          if (!track.audio_url || /(?:youtube\.com|youtu\.be)/i.test(track.audio_url)) fail(422, 'This track is streaming only. Downloads require a licensed audio file.');
          return respond(download(await run(db.from('downloads').upsert({ user_id: owner, song_id: id }, { onConflict: 'user_id,song_id' }).select('*,songs(*,artists(name))').single())));
        }
        if (method === 'DELETE' && parts.length === 4) { await run(db.from('downloads').delete().eq('user_id', owner).eq('song_id', integer(parts[3], 'song_id'))); return respond({ message: 'Download removed.' }); }
      }
      if (resource === 'listening-history') {
        if (method === 'GET' && parts.length === 3) return respond(await run(db.from('listening_history').select('*').eq('user_id', owner).order('played_at', { ascending: false }).limit(200)));
        if (method === 'POST' || (method === 'PUT' && parts.length === 4)) {
          const values = { progress_seconds: integer(input.progress_seconds ?? 0, 'progress_seconds', 0, 86400), completed: bool(input.completed ?? false, 'completed'), skipped: bool(input.skipped ?? false, 'skipped') };
          if (method === 'POST' && parts.length === 3) {
            const created = await run(db.from('listening_history').insert({ ...values, user_id: owner, song_id: integer(input.song_id, 'song_id') }).select().single());
            return respond({ ...created, history_id: created.id, message: 'Listening history saved.' }, 201);
          }
          if (method === 'PUT') return respond(await run(db.from('listening_history').update(values).eq('id', integer(parts[3], 'history_id')).eq('user_id', owner).select().single()));
        }
      }
      if (resource === 'listening-stats' && method === 'GET') {
        const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const rows = await allRows(db, 'listening_history', 'id,progress_seconds,songs(genre,mood)', query => query.eq('user_id', owner).gte('played_at', start.toISOString()).lt('played_at', end.toISOString()));
        const rotation: Record<string, number> = { Happy: 0, Neutral: 0, Sad: 0, Exhausted: 0, Angry: 0 };
        let seconds = 0;
        for (const row of rows) { seconds += row.progress_seconds; rotation[inferMood(row.songs || {})] += row.progress_seconds; }
        for (const key of Object.keys(rotation)) rotation[key] = seconds ? Math.round(rotation[key] / seconds * 1000) / 10 : 0;
        return respond({ month_label: now.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }), year: now.getUTCFullYear(), total_seconds: seconds, hours_listened: Math.round(seconds / 36) / 100, records_visited: rows.length, favorite_tracks: await count(db, 'liked_songs', ['user_id', owner]), rotation, member_since: me.created_at });
      }
      if (resource === 'playback' && parts.length === 3) {
        if (method === 'GET') return respond(await run(db.from('playback_states').select('*').eq('user_id', owner).maybeSingle()) || { user_id: owner, song_id: null, position_seconds: 0, is_playing: false });
        if (method === 'PUT') return respond(await run(db.from('playback_states').upsert({ user_id: owner, song_id: input.song_id == null ? null : integer(input.song_id, 'song_id'), position_seconds: integer(input.position_seconds ?? 0, 'position_seconds', 0, 86400), is_playing: bool(input.is_playing ?? false, 'is_playing'), updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select().single()));
      }
      if (resource === 'queue') {
        if (method === 'GET' && parts.length === 3) return respond((await run(db.from('queue_items').select('*,songs(*,artists(name),albums(title))').eq('user_id', owner).order('position').order('id'))).map((row: Row) => ({ queue_item_id: row.id, position: row.position, song: song(row.songs) })));
        if (method === 'POST' && parts.length === 3) return respond(await run(db.rpc('append_queue', { target_song_id: integer(input.song_id, 'song_id') })), 201);
        if (method === 'DELETE' && parts.length === 4) { await run(db.from('queue_items').delete().eq('user_id', owner).eq('id', integer(parts[3], 'queue_item_id')).select('id').single()); return respond({ message: 'Queue item removed.' }); }
      }
      if (resource === 'recommendations' && method === 'GET') {
        const [catalog, likes, history] = await Promise.all([allRows(db, 'songs', songSelect), run(db.from('liked_songs').select('song_id').eq('user_id', owner)), run(db.from('listening_history').select('song_id').eq('user_id', owner).order('played_at', { ascending: false }).limit(100))]);
        const liked = new Set(likes.map((row: Row) => row.song_id)), visited = new Set([...liked, ...history.map((row: Row) => row.song_id)]);
        const preferences = catalog.filter(row => visited.has(row.id));
        const score = (row: Row) => preferences.reduce((sum, preference) => sum + (liked.has(preference.id) ? 3 : 1) * ((preference.genre === row.genre ? 4 : 0) + (preference.language === row.language ? 2 : 0) + (preference.artist_id === row.artist_id ? 1 : 0)), 0);
        return respond(catalog.filter(row => !visited.has(row.id)).sort((a, b) => score(b) - score(a) || b.id - a.id).slice(0, 10).map(song));
      }
    }
    return respond({ detail: 'Endpoint not found.' }, 404);
  } catch (error) {
    if (error instanceof ApiError || error instanceof BillingError) return respond({ detail: error.message }, error.status);
    console.error('API request failed', error instanceof Error ? error.name : 'Unknown error');
    return respond({ detail: 'The request could not be completed. Please try again.' }, 500);
  }
}
if (import.meta.main) Deno.serve(handleRequest);
