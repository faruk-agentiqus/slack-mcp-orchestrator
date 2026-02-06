import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_PATH = path.join(DATA_DIR, 'mcp-orchestrator.db');

let db: Database.Database;

/** Initialise SQLite database with WAL mode and create tables. */
export function initDatabase(): Database.Database {
  if (db) return db;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS org_defaults (
      org_id      TEXT PRIMARY KEY,
      permissions TEXT NOT NULL,
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id    TEXT NOT NULL,
      org_id     TEXT NOT NULL,
      overrides  TEXT NOT NULL,
      is_active  INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, org_id)
    );

    CREATE TABLE IF NOT EXISTS tokens (
      jti        TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      org_id     TEXT NOT NULL,
      is_revoked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );
  `);

  return db;
}

/** Return the singleton database instance. Throws if not yet initialised. */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialised. Call initDatabase() first.');
  }
  return db;
}
