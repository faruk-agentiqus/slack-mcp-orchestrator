import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In production (Docker), use absolute path matching the volume mount.
// In dev, resolve relative to source root.
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../data');
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

    CREATE TABLE IF NOT EXISTS installations (
      id          TEXT PRIMARY KEY,
      team_id     TEXT,
      enterprise_id TEXT,
      bot_token   TEXT NOT NULL,
      bot_id      TEXT,
      bot_user_id TEXT,
      is_enterprise INTEGER DEFAULT 0,
      data        TEXT NOT NULL,
      installed_at TEXT DEFAULT (datetime('now')),
      updated_at   TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_installations_team ON installations(team_id);
    CREATE INDEX IF NOT EXISTS idx_installations_enterprise ON installations(enterprise_id);

    CREATE TABLE IF NOT EXISTS channel_blocklist (
      channel_id   TEXT NOT NULL,
      org_id       TEXT NOT NULL,
      channel_name TEXT,
      block_read   INTEGER DEFAULT 1,
      block_write  INTEGER DEFAULT 1,
      blocked_by   TEXT NOT NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (channel_id, org_id)
    );
    CREATE INDEX IF NOT EXISTS idx_channel_blocklist_org ON channel_blocklist(org_id);
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
