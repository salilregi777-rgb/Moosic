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
  await db.exec(readFileSync(root + 'tests/security.sql', 'utf8'));
  console.log('RLS, ownership, role escalation, queue and playlist tests passed.');
  await db.exec(readFileSync(root + 'tests/billing-security.sql', 'utf8'));
  console.log('Billing ownership, idempotency, refunds and expiry tests passed.');
} finally {
  await db.close();
}
