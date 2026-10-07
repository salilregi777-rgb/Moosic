"""Offline regression tests for legacy snapshot validation; never contacts Auth."""
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('legacy', Path(__file__).parents[1] / 'scripts/import_legacy.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'snapshot.db'
        self.db = sqlite3.connect(self.path)
        self.db.executescript('CREATE TABLE users(id INTEGER PRIMARY KEY, name TEXT, username TEXT, email TEXT, password TEXT); CREATE TABLE songs(id INTEGER PRIMARY KEY, artist_id INTEGER);')
        self.db.execute('INSERT INTO users VALUES(1,?,?,?,?)', ('Test', 'listener', 'listener@example.test', '$2b$12$' + 'a' * 53))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.temp.cleanup()

    def test_reads_snapshot_without_modifying_it(self):
        before = self.path.read_bytes()
        data = legacy.read_snapshot(self.path)
        self.assertEqual(len(data['users']), 1)
        self.assertEqual(data['queue_items'], [])
        self.assertEqual(before, self.path.read_bytes())

    def test_rejects_plaintext_passwords(self):
        self.db.execute("UPDATE users SET password='not-a-password-hash'")
        self.db.commit()
        with self.assertRaisesRegex(ValueError, 'unsupported password hash'):
            legacy.read_snapshot(self.path)

    def test_rejects_case_insensitive_identity_collisions(self):
        self.db.execute('INSERT INTO users VALUES(2,?,?,?,?)', ('Other', 'LISTENER', 'other@example.test', '$2b$12$' + 'a' * 53))
        self.db.commit()
        with self.assertRaisesRegex(ValueError, 'duplicate username'):
            legacy.read_snapshot(self.path)

    def test_rejects_orphaned_foreign_keys(self):
        self.db.execute('INSERT INTO songs VALUES(1,999)')
        self.db.commit()
        with self.assertRaisesRegex(ValueError, 'Orphaned artist_id'):
            legacy.read_snapshot(self.path)


if __name__ == '__main__':
    unittest.main()
