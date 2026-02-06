import { getDatabase } from '../db/database.js';

/**
 * Each permission key maps to read/write booleans.
 * Keys correspond to Slack API capability groups:
 *   channels:read, chat:write, users:read
 */
export interface PermissionFlags {
  read: boolean;
  write: boolean;
}

export type PermissionMap = Record<string, PermissionFlags>;

/** All permission keys supported by the orchestrator. */
export const PERMISSION_KEYS = ['channels', 'chat', 'users'] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/** Build a default (empty/denied) permission map. */
export function emptyPermissions(): PermissionMap {
  const map: PermissionMap = {};
  for (const key of PERMISSION_KEYS) {
    map[key] = { read: false, write: false };
  }
  return map;
}

// ---------------------------------------------------------------------------
// Org defaults
// ---------------------------------------------------------------------------

/** Get org-level default permissions. Returns empty map if none set. */
export function getOrgDefaults(orgId: string): PermissionMap {
  const db = getDatabase();
  const row = db
    .prepare('SELECT permissions FROM org_defaults WHERE org_id = ?')
    .get(orgId) as { permissions: string } | undefined;

  if (!row) return emptyPermissions();
  return JSON.parse(row.permissions) as PermissionMap;
}

/** Upsert org-level default permissions. */
export function setOrgDefaults(
  orgId: string,
  permissions: PermissionMap
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO org_defaults (org_id, permissions, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(org_id) DO UPDATE SET permissions = excluded.permissions, updated_at = excluded.updated_at`
  ).run(orgId, JSON.stringify(permissions));
}

// ---------------------------------------------------------------------------
// Per-user overrides
// ---------------------------------------------------------------------------

/** Get raw user overrides (partial map). Returns null if user has no record. */
export function getUserOverrides(
  userId: string,
  orgId: string
): { overrides: PermissionMap; isActive: boolean } | null {
  const db = getDatabase();
  const row = db
    .prepare(
      'SELECT overrides, is_active FROM user_permissions WHERE user_id = ? AND org_id = ?'
    )
    .get(userId, orgId) as { overrides: string; is_active: number } | undefined;

  if (!row) return null;
  return {
    overrides: JSON.parse(row.overrides) as PermissionMap,
    isActive: row.is_active === 1,
  };
}

/** Upsert user-specific permission overrides. */
export function setUserOverrides(
  userId: string,
  orgId: string,
  overrides: PermissionMap
): void {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO user_permissions (user_id, org_id, overrides, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, org_id) DO UPDATE SET overrides = excluded.overrides, updated_at = excluded.updated_at`
  ).run(userId, orgId, JSON.stringify(overrides));
}

/** Enable or disable a user's MCP access. */
export function toggleUser(
  userId: string,
  orgId: string,
  active: boolean
): void {
  const db = getDatabase();
  db.prepare(
    `UPDATE user_permissions SET is_active = ?, updated_at = datetime('now') WHERE user_id = ? AND org_id = ?`
  ).run(active ? 1 : 0, userId, orgId);
}

/** Remove a user entirely. */
export function removeUser(userId: string, orgId: string): void {
  const db = getDatabase();
  db.prepare(
    'DELETE FROM user_permissions WHERE user_id = ? AND org_id = ?'
  ).run(userId, orgId);
}

// ---------------------------------------------------------------------------
// Effective permissions (org defaults merged with user overrides)
// ---------------------------------------------------------------------------

/**
 * Compute the effective permissions for a user.
 * User overrides win over org defaults for any key that is present.
 */
export function getEffectivePermissions(
  userId: string,
  orgId: string
): PermissionMap {
  const defaults = getOrgDefaults(orgId);
  const userRow = getUserOverrides(userId, orgId);

  // If user has no record, fall back to org defaults
  if (!userRow) return defaults;

  // If user is deactivated, deny everything
  if (!userRow.isActive) return emptyPermissions();

  // Merge: user overrides win per key
  const merged = { ...defaults };
  for (const [key, flags] of Object.entries(userRow.overrides)) {
    merged[key] = { ...merged[key], ...flags };
  }
  return merged;
}

/**
 * Check whether a specific operation is allowed for a user.
 * @param permissionKey - e.g. "channels", "chat"
 * @param operation     - "read" or "write"
 */
export function isAllowed(
  userId: string,
  orgId: string,
  permissionKey: string,
  operation: 'read' | 'write'
): boolean {
  const perms = getEffectivePermissions(userId, orgId);
  const flags = perms[permissionKey];
  if (!flags) return false;
  return flags[operation] === true;
}

// ---------------------------------------------------------------------------
// User listing
// ---------------------------------------------------------------------------

export interface UserPermissionRow {
  userId: string;
  isActive: boolean;
  overrides: PermissionMap;
  effective: PermissionMap;
}

/** List all users with permission records for an org. */
export function listUsers(orgId: string): UserPermissionRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT user_id, is_active, overrides FROM user_permissions WHERE org_id = ?'
    )
    .all(orgId) as Array<{
    user_id: string;
    is_active: number;
    overrides: string;
  }>;

  return rows.map(row => ({
    userId: row.user_id,
    isActive: row.is_active === 1,
    overrides: JSON.parse(row.overrides) as PermissionMap,
    effective: getEffectivePermissions(row.user_id, orgId),
  }));
}
