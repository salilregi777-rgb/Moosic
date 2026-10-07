#!/usr/bin/env python3
"""Migrate a read-only legacy SQLite snapshot into Supabase (dry run by default).

Passwords remain bcrypt hashes; they are imported using Supabase Auth's admin API.
Use only from a trusted workstation with SUPABASE_SERVICE_ROLE_KEY in the environment.
The checkpoint contains IDs only, never passwords or keys. Keep it until validation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from urllib.error import HTTPError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

TABLES = ['users', 'artists', 'albums', 'songs', 'playlists', 'playlist_songs',
          'liked_songs', 'downloads', 'listening_history', 'playback_states',
          'queue_items', 'payments']
BOOL_FIELDS = {'is_premium', 'is_deleted', 'is_playable', 'completed', 'skipped', 'is_playing'}
COLUMNS = {
    'artists': ['name', 'image_url'],
    'albums': ['title', 'artist_id', 'release_date', 'cover_url'],
    'songs': ['title', 'artist_id', 'album_id', 'genre', 'mood', 'language', 'duration', 'audio_url', 'cover_url', 'is_playable', 'audio_checked_at'],
    'playlists': ['user_id', 'name', 'cover_url', 'description', 'is_deleted', 'deleted_at'],
    'playlist_songs': ['playlist_id', 'song_id', 'position'],
    'liked_songs': ['user_id', 'song_id'],
    'downloads': ['user_id', 'song_id', 'downloaded_at'],
    'listening_history': ['user_id', 'song_id', 'played_at', 'progress_seconds', 'completed', 'skipped'],
    'playback_states': ['user_id', 'song_id', 'position_seconds', 'is_playing', 'updated_at'],
    'queue_items': ['user_id', 'song_id', 'position', 'added_at'],
    'payments': ['user_id', 'plan', 'amount', 'currency', 'status', 'payment_date'],
}
REFERENCES = {'user_id': 'users', 'artist_id': 'artists', 'album_id': 'albums', 'song_id': 'songs', 'playlist_id': 'playlists'}


def read_snapshot(path):
    connection = sqlite3.connect(f"file:{quote(str(path))}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    existing = {row[0] for row in connection.execute("select name from sqlite_master where type='table'")}
    result = {name: [dict(row) for row in connection.execute(f'SELECT * FROM "{name}" ORDER BY id')] if name in existing else [] for name in TABLES}
    connection.close()
    for user in result['users']:
        if not re.fullmatch(r'\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}', user.get('password', '')):
            raise ValueError(f"User #{user['id']} has an unsupported password hash. No changes made.")
        if not user.get('email') or not user.get('username'):
            raise ValueError(f"User #{user['id']} has an incomplete identity. No changes made.")
    for field in ('email', 'username'):
        normalized = [str(user[field]).lower() for user in result['users']]
        if len(normalized) != len(set(normalized)):
            raise ValueError(f"Legacy users contain case-insensitive duplicate {field} values. Resolve those in a copy before import.")
    ids = {name: {row['id'] for row in rows} for name, rows in result.items()}
    for table, rows in result.items():
        for row in rows:
            for field, target in REFERENCES.items():
                if field in row and row[field] is not None and row[field] not in ids[target]:
                    raise ValueError(f"Orphaned {field} on {table} row #{row['id']}. Resolve it in a copy before import.")
    return result


class Importer:
    def __init__(self, options, source_digest):
        self.options = options
        self.url = os.environ.get('SUPABASE_URL', '').rstrip('/')
        self.key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        parsed = urlparse(self.url)
        if not self.key or not parsed.netloc or (parsed.scheme != 'https' and parsed.hostname not in ('localhost', '127.0.0.1')):
            raise ValueError('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for this trusted migration process.')
        self.checkpoint = {'project': self.url, 'source_sha256': source_digest, 'ids': {name: {} for name in TABLES}, 'pending_auth': {}}
        if options.checkpoint.exists():
            self.checkpoint = json.loads(options.checkpoint.read_text())
            if self.checkpoint['project'] != self.url or self.checkpoint['source_sha256'] != source_digest:
                raise ValueError('Checkpoint does not match this project and SQLite snapshot.')
        elif self.get('profiles', select='id', limit=1):
            raise ValueError('Fresh imports require a project without user profiles. This prevents accidental account merging. Catalog seed data is supported.')
        self.checkpoint.setdefault('pending_auth', {})

    def request(self, path, method='GET', data=None, prefer=None):
        headers = {'apikey': self.key, 'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json'}
        if prefer:
            headers['Prefer'] = prefer
        req = Request(self.url + path, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
        try:
            with urlopen(req, timeout=60) as response:
                content = response.read()
                return json.loads(content) if content else None
        except HTTPError as error:
            # Never echo request payloads, account details, or password hashes.
            raise RuntimeError(f"Supabase rejected {method} {path.split('?')[0]} (HTTP {error.code}). Check the dashboard logs. Your checkpoint is safe to resume.") from None

    def get(self, table, **params):
        return self.request('/rest/v1/' + table + '?' + urlencode(params))

    def insert(self, table, data):
        return self.request('/rest/v1/' + table, 'POST', data, 'return=representation')[0]

    def update(self, table, row_id, data):
        return self.request('/rest/v1/' + table + '?id=eq.' + str(row_id), 'PATCH', data, 'return=representation')[0]

    def save(self):
        self.options.checkpoint.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.options.checkpoint.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.checkpoint, indent=2) + '\n')
        os.chmod(temporary, 0o600)
        temporary.replace(self.options.checkpoint)

    def remember(self, table, old_id, new_id):
        self.checkpoint['ids'][table][str(old_id)] = new_id
        self.save()

    def mapped(self, table, old_id):
        if old_id is None:
            return None
        return self.checkpoint['ids'][table][str(old_id)]

    def users(self, users):
        for row in users:
            old_id = str(row['id'])
            if old_id in self.checkpoint['ids']['users']:
                continue
            # A saved pending UUID also lets us recover from a successful Auth
            # creation followed by an interrupted profile update.
            auth_id = self.checkpoint['pending_auth'].get(old_id)
            if not auth_id:
                # app_metadata is admin-only. The marker safely recovers a create
                # that succeeded just before the local checkpoint was written.
                for page in range(1, 10000):
                    response = self.request('/auth/v1/admin/users?' + urlencode({'page': page, 'per_page': 1000}))
                    found = next((u for u in response.get('users', []) if u.get('app_metadata', {}).get('moosic_import_source') == self.checkpoint['source_sha256'] and u.get('app_metadata', {}).get('moosic_legacy_id') == row['id']), None)
                    if found:
                        auth_id = found['id']
                        break
                    if len(response.get('users', [])) < 1000:
                        break
                if not auth_id:
                    created = self.request('/auth/v1/admin/users', 'POST', {
                        'email': row['email'].strip().lower(), 'password_hash': row['password'],
                        'email_confirm': bool(self.options.trust_legacy_emails),
                        'user_metadata': {'name': row['name'], 'username': row['username']},
                        'app_metadata': {'moosic_import_source': self.checkpoint['source_sha256'], 'moosic_legacy_id': row['id']},
                    })
                    auth_id = created['id']
                self.checkpoint['pending_auth'][old_id] = auth_id
                self.save()
            target = self.get('profiles', auth_user_id='eq.' + auth_id, select='id')[0]
            changes = {'profile_note': row.get('profile_note') or '',
                       'role': 'manager' if self.options.preserve_managers and row.get('role') == 'manager' else 'user',
                       'is_premium': bool(self.options.preserve_premium and row.get('is_premium'))}
            if row.get('created_at'):
                changes['created_at'] = row['created_at']
            self.update('profiles', target['id'], changes)
            self.remember('users', row['id'], target['id'])
        print(f"users: {len(users)} imported or already mapped")

    def table(self, table, rows):
        for row in rows:
            if str(row['id']) in self.checkpoint['ids'][table]:
                continue
            data = {key: row[key] for key in COLUMNS[table] if key in row}
            for field in data:
                if field in REFERENCES:
                    data[field] = self.mapped(REFERENCES[field], data[field])
                elif field in BOOL_FIELDS and data[field] is not None:
                    data[field] = bool(data[field])
            if table == 'songs':
                data['language'] = data.get('language') or 'English'
                if not data.get('audio_url'):
                    data['is_playable'] = False
            if table == 'payments':
                # The legacy checkout never charged cards. Keep the audit trail
                # without misreporting test transactions as real revenue.
                data['status'] = 'legacy_test'
            # Stable natural keys make retry/seed merges safe. Private rows
            # without a unique natural key are recorded immediately in checkpoint.
            lookup = None
            if table == 'artists':
                # Avoid PostgREST wildcard matching for names containing % or _.
                lookup = next((item for item in self.get(table, select='id,name') if item['name'].casefold() == data['name'].casefold()), None)
            elif table in ('albums', 'songs') and data.get('artist_id') is not None:
                matches = self.get(table, artist_id='eq.' + str(data['artist_id']), title='eq.' + data['title'], select='id')
                lookup = matches[0] if matches else None
            elif table in ('liked_songs', 'downloads', 'playback_states', 'playlist_songs'):
                keys = ['playlist_id', 'song_id'] if table == 'playlist_songs' else ['user_id'] if table == 'playback_states' else ['user_id', 'song_id']
                matches = self.get(table, select='id', **{key: 'eq.' + str(data[key]) for key in keys})
                lookup = matches[0] if matches else None
            target = self.update(table, lookup['id'], data) if lookup else self.insert(table, data)
            self.remember(table, row['id'], target['id'])
        print(f"{table}: {len(rows)} imported or already mapped")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Path to a stopped/consistent SQLite snapshot')
    parser.add_argument('--apply', action='store_true', help='Apply to Supabase; omitted means read-only validation')
    parser.add_argument('--checkpoint', type=Path, default=Path('.moosic-import-checkpoint.json'))
    parser.add_argument('--trust-legacy-emails', action='store_true', help='Mark legacy email identities verified only if ownership has already been verified')
    parser.add_argument('--preserve-managers', action='store_true', help='Explicitly transfer legacy manager roles')
    parser.add_argument('--preserve-premium', action='store_true', help='Explicitly transfer previously granted Premium access (legacy checkout was a mock)')
    options = parser.parse_args()
    source = options.source.expanduser().resolve(strict=True)
    data = read_snapshot(source)
    print(json.dumps({table: len(rows) for table, rows in data.items()}, indent=2))
    if not options.apply:
        print('Dry run passed. No network requests or destination changes were made.')
        return
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    importer = Importer(options, digest)
    importer.save()
    importer.users(data['users'])
    for table in TABLES[1:]:
        importer.table(table, data[table])
    print('Import complete. Compare the checkpoint mapping/counts and sign in to verify before retiring the old deployment.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, sqlite3.Error) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
