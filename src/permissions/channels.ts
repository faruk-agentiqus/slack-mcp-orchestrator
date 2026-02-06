import { getDatabase } from '../db/database.js';

export interface BlockedChannel {
  channelId: string;
  channelName: string | null;
  blockRead: boolean;
  blockWrite: boolean;
  blockedBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Block a channel for an org. Admin sets read/write restrictions. */
export function blockChannel(
  channelId: string,
  orgId: string,
  opts: {
    channelName?: string;
    blockRead?: boolean;
    blockWrite?: boolean;
    blockedBy: string;
  }
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO channel_blocklist (channel_id, org_id, channel_name, block_read, block_write, blocked_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id, org_id) DO UPDATE SET
       channel_name = COALESCE(excluded.channel_name, channel_blocklist.channel_name),
       block_read = excluded.block_read,
       block_write = excluded.block_write,
       blocked_by = excluded.blocked_by`
  ).run(
    channelId,
    orgId,
    opts.channelName ?? null,
    opts.blockRead !== false ? 1 : 0,
    opts.blockWrite !== false ? 1 : 0,
    opts.blockedBy
  );
}

/** Unblock a channel entirely (removes from blocklist). */
export function unblockChannel(channelId: string, orgId: string): void {
  const db = getDatabase();
  db.prepare(
    'DELETE FROM channel_blocklist WHERE channel_id = ? AND org_id = ?'
  ).run(channelId, orgId);
}

/** Get all blocked channels for an org. */
export function getBlockedChannels(orgId: string): BlockedChannel[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT channel_id, channel_name, block_read, block_write, blocked_by, created_at FROM channel_blocklist WHERE org_id = ?'
    )
    .all(orgId) as Array<{
    channel_id: string;
    channel_name: string | null;
    block_read: number;
    block_write: number;
    blocked_by: string;
    created_at: string;
  }>;

  return rows.map(r => ({
    channelId: r.channel_id,
    channelName: r.channel_name,
    blockRead: r.block_read === 1,
    blockWrite: r.block_write === 1,
    blockedBy: r.blocked_by,
    createdAt: r.created_at,
  }));
}

/** Get blocklist entry for a specific channel, or null if not blocked. */
export function getChannelBlock(
  channelId: string,
  orgId: string
): BlockedChannel | null {
  const db = getDatabase();
  const row = db
    .prepare(
      'SELECT channel_id, channel_name, block_read, block_write, blocked_by, created_at FROM channel_blocklist WHERE channel_id = ? AND org_id = ?'
    )
    .get(channelId, orgId) as
    | {
        channel_id: string;
        channel_name: string | null;
        block_read: number;
        block_write: number;
        blocked_by: string;
        created_at: string;
      }
    | undefined;

  if (!row) return null;

  return {
    channelId: row.channel_id,
    channelName: row.channel_name,
    blockRead: row.block_read === 1,
    blockWrite: row.block_write === 1,
    blockedBy: row.blocked_by,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Enforcement
// ---------------------------------------------------------------------------

/**
 * Check if a specific operation on a channel is allowed.
 * Blocklist approach: everything is allowed unless explicitly blocked.
 */
export function isChannelAllowed(
  channelId: string,
  orgId: string,
  operation: 'read' | 'write'
): boolean {
  const block = getChannelBlock(channelId, orgId);
  if (!block) return true; // Not in blocklist = allowed

  if (operation === 'read') return !block.blockRead;
  if (operation === 'write') return !block.blockWrite;
  return true;
}
