import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = fileURLToPath(new URL('../', import.meta.url));
const db = new PGlite();
try {
  // Stub only Supabase's managed schemas. Application SQL and RLS execute in
  // genuine PostgreSQL. Hosted Auth/Storage HTTP behavior is tested separately.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth, storage, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid,name text,bucket_id text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon, authenticated;
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
  `);
  for (const name of readdirSync(root + 'migrations').filter(name => name.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(root + 'migrations/' + name, 'utf8'));
  }
  console.log('Schema applied in PostgreSQL.');
  const seed = readFileSync(root + 'seed.sql', 'utf8');
  await db.exec(seed);
  const before = await db.query('select count(*)::int as count from public.songs');
  assert(before.rows[0].count > 0, 'Seed must populate the catalog.');
  await db.exec(seed);
  const after = await db.query('select count(*)::int as count from public.songs');
  assert.equal(after.rows[0].count, before.rows[0].count, 'Repeating seed must not duplicate songs.');
  console.log(`Catalog seed passed: ${before.rows[0].count} songs, no duplicates after repeated seed.`);
  const repairs = JSON.parse(readFileSync(root + 'catalog-source-repairs.json', 'utf8')).repairs;
  const repairSQL = readFileSync(root + 'migrations/202610070003_catalog_sources.sql', 'utf8');
  await db.exec('begin');
  for (const repair of repairs) {
    const row = await db.query('select s.audio_url from public.songs s join public.artists a on a.id=s.artist_id where s.title=$1 and a.name=$2', [repair.title, repair.artist]);
    assert.equal(row.rows[0].audio_url, repair.new_source, 'Fresh seed must contain verified source repairs.');
    await db.query('update public.songs set audio_url=$1 where title=$2 and artist_id=(select id from public.artists where name=$3)', [repair.old_source, repair.title, repair.artist]);
  }
  await db.exec(repairSQL);
  await db.exec(repairSQL);
  for (const repair of repairs) {
    const row = await db.query('select s.audio_url,s.is_playable from public.songs s join public.artists a on a.id=s.artist_id where s.title=$1 and a.name=$2', [repair.title, repair.artist]);
    assert.equal(row.rows[0].audio_url, repair.new_source);
    assert.equal(row.rows[0].is_playable, null, 'Metadata check must not claim playback certainty.');
  }
  await db.query("update public.songs set audio_url='https://example.test/manager.mp3' where title=$1", [repairs[0].title]);
  await db.exec(repairSQL);
  const preserved = await db.query('select audio_url from public.songs where title=$1', [repairs[0].title]);
  assert.equal(preserved.rows[0].audio_url, 'https://example.test/manager.mp3');
  await db.exec('rollback');
  console.log(`Verified ${repairs.length} catalog corrections, idempotency and manager-source preservation.`);
  const referenceRepairs = JSON.parse(readFileSync(root + 'catalog-source-repairs-v2.json', 'utf8')).repairs;
  const referenceSQL = readFileSync(root + 'migrations/202610070005_reference_catalog.sql', 'utf8');
  await db.exec('begin');
  for (const repair of referenceRepairs) {
    const current = await db.query('select s.id,s.audio_url from public.songs s join public.artists a on a.id=s.artist_id where s.title=$1 and a.name=$2', [repair.title, repair.new_artist || repair.artist]);
    assert.equal(current.rows[0].audio_url, repair.new_source);
    await db.query('update public.songs set audio_url=$1,artist_id=(select id from public.artists where name=$2) where id=$3', [repair.old_source, repair.artist, current.rows[0].id]);
  }
  await db.exec(referenceSQL);
  await db.exec(referenceSQL);
  for (const repair of referenceRepairs) {
    const row = await db.query('select s.audio_url,s.is_playable from public.songs s join public.artists a on a.id=s.artist_id where s.title=$1 and a.name=$2', [repair.title, repair.new_artist || repair.artist]);
    assert.equal(row.rows[0].audio_url, repair.new_source);
    assert.equal(row.rows[0].is_playable, null);
  }
  await db.query("update public.songs set audio_url='https://example.test/manager.mp3' where title=$1", [referenceRepairs[0].title]);
  await db.exec(referenceSQL);
  assert.equal((await db.query('select audio_url from public.songs where title=$1', [referenceRepairs[0].title])).rows[0].audio_url, 'https://example.test/manager.mp3');
  await db.exec('rollback');
  console.log(`Verified ${referenceRepairs.length} reference repairs, corrected artists, repeatability and preserved manager edits.`);
  const lowBattery = JSON.parse(readFileSync(root + 'low-battery-catalog.json', 'utf8'));
  const lowBatterySQL = readFileSync(root + 'migrations/202610090001_low_battery.sql', 'utf8');
  // The full transaction was applied with the migrations above. Run its body
  // inside a rollback here so preservation checks do not alter later fixtures.
  const lowBatteryBody = lowBatterySQL.replace(/^begin;\s*$|^commit;\s*$/gmi, '');
  await db.exec('begin');
  const retiredIds = [];
  for (const retired of lowBattery.retired) {
    const row = (await db.query('select s.id,s.is_playable from public.songs s join public.artists a on a.id=s.artist_id where s.title=$1 and a.name=$2', [retired.title, retired.artist])).rows[0];
    assert.equal(row.is_playable, false, 'Fresh seed must exclude retired songs from browsing.');
    retiredIds.push(row.id);
    await db.query('update public.songs set is_playable=true where id=$1', [row.id]);
  }
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('40000000-0000-4000-8000-000000000001','catalog-library@example.test','{"name":"Catalog library","username":"catalog_library"}');`);
  const savedPlaylist = (await db.query("insert into public.playlists(user_id,name) select id,'Preserve existing songs' from public.profiles where username='catalog_library' returning id")).rows[0].id;
  for (const id of retiredIds) await db.query('insert into public.playlist_songs(playlist_id,song_id) values($1,$2)', [savedPlaylist, id]);
  await db.exec(lowBatteryBody);
  await db.exec(lowBatteryBody);
  assert.equal((await db.query('select count(*)::int as count from public.songs')).rows[0].count, after.rows[0].count, 'Repeated migration must not duplicate songs.');
  for (const id of retiredIds) {
    assert.equal((await db.query('select is_playable from public.songs where id=$1', [id])).rows[0].is_playable, false);
    assert.equal((await db.query('select count(*)::int as count from public.playlist_songs where playlist_id=$1 and song_id=$2', [savedPlaylist, id])).rows[0].count, 1, 'Retirement must preserve library relationships.');
  }
  for (const track of lowBattery.tracks) {
    const rows = (await db.query('select s.* from public.songs s join public.artists a on a.id=s.artist_id where s.title=$1 and a.name=$2', [track.title, track.artist])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mood, 'Exhausted');
    assert.equal(rows[0].language, 'English');
    assert.equal(rows[0].duration, track.duration);
    assert.equal(rows[0].audio_url, `https://www.youtube.com/embed/${track.video_id}`);
    assert.equal(rows[0].cover_url, `https://i.ytimg.com/vi/${track.video_id}/hqdefault.jpg`);
    assert.equal(rows[0].is_playable, null, 'Metadata verification must not promise provider availability.');
  }
  await db.query("update public.songs set audio_url='https://example.test/manager-retired.mp3',is_playable=true where id=$1", [retiredIds[0]]);
  await db.query("update public.songs set audio_url='https://example.test/manager-new.mp3',cover_url='https://example.test/manager.jpg' where title=$1 and artist_id=(select id from public.artists where name=$2)", [lowBattery.tracks[0].title, lowBattery.tracks[0].artist]);
  await db.exec(lowBatteryBody);
  assert.equal((await db.query('select is_playable from public.songs where id=$1', [retiredIds[0]])).rows[0].is_playable, true, 'A manager replacement source must remain available.');
  const managerTrack = (await db.query('select audio_url,cover_url from public.songs where title=$1 and artist_id=(select id from public.artists where name=$2)', [lowBattery.tracks[0].title, lowBattery.tracks[0].artist])).rows[0];
  assert.equal(managerTrack.audio_url, 'https://example.test/manager-new.mp3');
  assert.equal(managerTrack.cover_url, 'https://example.test/manager.jpg');
  await db.exec('rollback');
  console.log(`Verified ${lowBattery.retired.length} retired entries, ${lowBattery.tracks.length} new Low Battery songs, repeatability and preserved libraries/manager edits.`);
  await db.exec(readFileSync(root + 'tests/security.sql', 'utf8'));
  console.log('RLS, ownership, role escalation, queue and playlist tests passed.');
  await db.exec(readFileSync(root + 'tests/billing-security.sql', 'utf8'));
  console.log('Billing ownership, idempotency, refunds and expiry tests passed.');
  await db.exec(readFileSync(root + 'tests/demo-premium.sql', 'utf8'));
  console.log('Demo Premium activation, cancellation, account isolation and no-charge checks passed.');
} finally {
  await db.close();
}
