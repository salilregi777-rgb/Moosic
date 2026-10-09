# Moosic on Supabase

The runtime backend is Supabase Auth, Postgres with row-level security, Storage, and the `api` Edge Function. React remains a static website hosted on Vercel or another static host. The Python/SQLite application is a legacy reference, not a dependency of the new app.

## Deployment status — 9 October 2026

The frontend uses [moosic-xi.vercel.app](https://moosic-xi.vercel.app), in Vercel scope `salilregi777-8318s-projects`. Project `meyuavzdjgyxunyxgqhu` has all six migrations, Storage buckets/policies, 79 catalog records (three retired originals), and demo Premium activation/cancellation. All 66 corrected catalog sources passed a live-domain playback-start check; the historical repair manifest lists six ambiguous title/artist pairs. Three are now retired by the Low Battery update; the remaining three still need corrected sources. No legacy accounts or libraries have been imported without the source database backup.

The frontend release includes the single-disc scroll reveal, hover-only tilt, detailed metallic backs, and the shortened Download confirmation. Migration `202610090001_low_battery.sql` was applied successfully through the signed-in dashboard SQL editor. It retires three invalid Exhausted entries without deleting their IDs and adds seven new songs. All seven official video sources passed an actual playback-start check in the local app player. The live API confirms all seven new songs and `is_playable=false` on the three retired originals. Low Battery keeps the previous remaining track after the new selections. Fresh setup seeds contain 79 records including the three retired rows.

Downloads are account-saved streaming references, not downloaded files. The frontend reads and writes the existing `downloads` table through the signed-in Supabase client. Existing RLS enforces account ownership and Premium access. The matching Edge Function download-route update is prepared in this checkout; the frontend does not depend on that update being deployed.

## Configuration

Frontend `.env.local` belongs in `Frontend/MOOSIC-visual-refresh-final/MOOSIC-visual-refresh/artifacts/moodsic/`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; legacy `VITE_SUPABASE_ANON_KEY` is also supported. Never place service-role keys or database passwords in `VITE_` variables. The local connection for this migration is project `meyuavzdjgyxunyxgqhu`.

The function uses Supabase's built-in `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Requests to private endpoints verify the caller through `auth.getUser()` and query with that caller's JWT so RLS remains active. Only the verified billing module uses the built-in `SUPABASE_SERVICE_ROLE_KEY` for protected payment RPCs; it never reaches the browser. `verify_jwt = false` permits public catalog requests and modern publishable keys; it does not remove the function's authentication checks. Optionally set `ALLOWED_ORIGINS` to a comma-separated list of your frontend origins.

## Deploy a new project

Using the Supabase CLI from this repository root:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --include-seed
supabase functions deploy api
```

Alternatively, run each file in `migrations/` once in filename order, followed by `seed.sql`, in the dashboard SQL editor. Deploy the complete `functions/api/` directory as the function named `api`, including its `billing.ts` dependency (or a bundled entry point). Configure the function to validate user tokens internally rather than using the legacy gateway JWT check, as specified in `config.toml`. For migrations applied manually, mark each corresponding version applied with `supabase migration repair VERSION --status applied` after linking and before using later CLI migrations. Do not rerun schema migrations against the existing live schema.

In Authentication → URL Configuration set the production Site URL to `https://moosic-xi.vercel.app` (or the actual frontend domain). Add `https://moosic-xi.vercel.app/**`, `http://localhost:5173/**`, and `http://127.0.0.1:5173/**` to Redirect URLs. Email confirmation remains enabled; users confirm their email before signing in. Configure your own SMTP service before inviting a larger audience.

Set both frontend environment variables in Vercel and deploy from the repository root. The public URL/key alone cannot apply schema migrations or deploy functions.

## Update the deployed website

Deployment does not prevent later edits. The current Vercel project is linked to this checkout; production updates retain [moosic-xi.vercel.app](https://moosic-xi.vercel.app). With the correct public Supabase variables in the maintained frontend's `.env.local`, run from the repository root:

```sh
pnpm test
pnpm build:vercel
pnpm dlx vercel@62.4.0 deploy --prebuilt --prod --scope salilregi777-8318s-projects
```

`build:vercel` builds the frontend and prepares `.vercel/output` for deployment. Existing Supabase accounts, playlists, and Storage files persist independently of frontend deployments. For backend changes, add and apply a new database migration or deploy the updated `api` function separately. Do not rerun the initial schema against the live project.

Vercel is connected to the GitHub repository. The current release was deployed from local files; the same source can also be deployed by pushing the linked branch.

## Catalog and audio

`seed.sql` carries the catalog metadata (79 records, including three retired originals). It is safe to repeat and does not overwrite manager edits. It is not a backup of a production database. Entries without a real audio URL are marked unavailable. Availability of third-party YouTube embeds is not guaranteed; the player presents its own controls and retry guidance when a source cannot be played. Failures do not silently advance to another song.

The public `music` bucket accepts supported audio files up to 50 MB, `covers` accepts images up to 5 MB, and `avatars` up to 2 MB. Only managers can upload or change catalog media. Users can write avatars only beneath their own Auth UUID path. These buckets serve public media; private libraries, profiles, and listening activity remain protected by RLS.

Sign up through Moosic, confirm email, then grant the intended administrator manager access from the trusted SQL editor:

```sql
update public.profiles set role = 'manager' where email = 'YOUR_ADMIN_EMAIL';
```

Sign out and back in. Manager → Songs → Edit offers an audio URL editor and Storage uploader. It updates the song only after upload succeeds; if linking fails, the uploaded URL remains available for retry.

## Move existing accounts and libraries

No SQLite backup or original audio files were included in this checkout. The seed cannot reconstruct existing accounts, private playlists, likes, history, or original recordings. Obtain a consistent backup from the old server before shutting it down.

`scripts/import_legacy.py` reads SQLite in read-only mode. Its default dry run validates identities, bcrypt hashes, and foreign keys without network requests:

```sh
python3 supabase/scripts/import_legacy.py /path/to/backup.db
```

For a reviewed import into a project with no existing user profiles, supply `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through your local environment, then add `--apply`. Keep its private checkpoint until the import has been verified. The script preserves relationships through ID mappings, imports bcrypt hashes through the Auth admin API, and labels historical mock payments `legacy_test` rather than reporting real revenue. Manager and Premium grants transfer only with explicit `--preserve-managers` / `--preserve-premium` flags. Use `--trust-legacy-emails` only when the old system already verified email ownership.

If a write is interrupted after reaching Supabase but before its checkpoint is recorded, inspect the destination before rerunning: records without a natural unique key (history, queue, payments, playlists) need reconciliation. This importer is not an atomic cross-service transaction. Use a fresh staging project first, compare record counts and relationships, verify accounts, and only then cut over production.

## Tests and operational limits

```sh
pnpm test
pnpm build
pnpm --dir supabase/tests install
pnpm --dir supabase/tests test
deno check --node-modules-dir=auto --lock=supabase/functions/deno.lock supabase/functions/api/index.ts
```

The database harness runs the actual migration and RLS in PostgreSQL via PGlite with small stubs for Supabase's managed Auth/Storage schemas. It tests ownership boundaries, role escalation, payments, Premium access, reorder atomicity, and queue ordering. Hosted email delivery, Storage HTTP behavior, and third-party video availability still need live checks.

Premium currently uses a clearly marked demo checkout. Test card 4242 4242 4242 4242, a current/future MM/YY expiry, and three-digit test CVV unlock all Premium features; only an empty activation request reaches Supabase, never card fields. Demo cancellation was checked against the live project. Optional verified Razorpay billing remains disabled pending merchant configuration; see [billing setup](BILLING.md). Saved tracks stream online and are not an offline media cache. Theme preferences remain per browser. The app has no service-role credentials in its browser bundle.

The catalog repair manifests and migration 005 preserve song IDs and user playlists. Metadata and playback-start checks do not guarantee future provider or geographic availability. Use Manager uploads for audio files the project has permission to host.

References: [Supabase Auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Edge Function authentication](https://supabase.com/docs/guides/functions/auth-legacy-jwt), [API key types](https://supabase.com/docs/guides/getting-started/api-keys).
