import type {
  Installation,
  InstallationQuery,
  InstallationStore,
} from '@slack/bolt';
import { getDatabase } from './database.js';

/**
 * Derive the primary key for an installation.
 * Org-wide installs key by enterprise_id, single-workspace by team_id.
 */
function installationId(installation: Installation): string {
  if (installation.isEnterpriseInstall && installation.enterprise?.id) {
    return `enterprise:${installation.enterprise.id}`;
  }
  if (installation.team?.id) {
    return `team:${installation.team.id}`;
  }
  throw new Error('Installation has neither enterprise nor team ID');
}

function queryId(query: InstallationQuery<boolean>): string {
  if (query.isEnterpriseInstall && query.enterpriseId) {
    return `enterprise:${query.enterpriseId}`;
  }
  if (query.teamId) {
    return `team:${query.teamId}`;
  }
  throw new Error('Query has neither enterprise nor team ID');
}

/**
 * SQLite-backed InstallationStore for multi-tenant Slack OAuth.
 * Each workspace/org install gets a row with its bot token and full data blob.
 */
export const sqliteInstallationStore: InstallationStore = {
  storeInstallation: async installation => {
    const db = getDatabase();
    const id = installationId(installation);

    db.prepare(
      `INSERT INTO installations (id, team_id, enterprise_id, bot_token, bot_id, bot_user_id, is_enterprise, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         bot_token = excluded.bot_token,
         bot_id = excluded.bot_id,
         bot_user_id = excluded.bot_user_id,
         data = excluded.data,
         updated_at = excluded.updated_at`
    ).run(
      id,
      installation.team?.id ?? null,
      installation.enterprise?.id ?? null,
      installation.bot?.token ?? '',
      installation.bot?.id ?? null,
      installation.bot?.userId ?? null,
      installation.isEnterpriseInstall ? 1 : 0,
      JSON.stringify(installation)
    );
  },

  fetchInstallation: async query => {
    const db = getDatabase();
    const id = queryId(query);
    const row = db
      .prepare('SELECT data FROM installations WHERE id = ?')
      .get(id) as { data: string } | undefined;

    if (!row) {
      throw new Error(`Installation not found for ${id}`);
    }
    return JSON.parse(row.data) as Installation;
  },

  deleteInstallation: async query => {
    const db = getDatabase();
    const id = queryId(query);
    db.prepare('DELETE FROM installations WHERE id = ?').run(id);
  },
};

// ---------------------------------------------------------------------------
// Helper: look up a bot token by org ID (used by the MCP API layer)
// ---------------------------------------------------------------------------

export interface InstallationInfo {
  botToken: string;
  teamId: string | null;
  enterpriseId: string | null;
}

/**
 * Look up the bot token for a given org ID.
 * Tries enterprise lookup first, then team lookup.
 */
export function getInstallationByOrgId(orgId: string): InstallationInfo | null {
  const db = getDatabase();

  // Try enterprise-level first
  let row = db
    .prepare(
      'SELECT bot_token, team_id, enterprise_id FROM installations WHERE enterprise_id = ?'
    )
    .get(orgId) as
    | {
        bot_token: string;
        team_id: string | null;
        enterprise_id: string | null;
      }
    | undefined;

  // Fall back to team-level
  if (!row) {
    row = db
      .prepare(
        'SELECT bot_token, team_id, enterprise_id FROM installations WHERE team_id = ?'
      )
      .get(orgId) as typeof row;
  }

  if (!row) return null;

  return {
    botToken: row.bot_token,
    teamId: row.team_id,
    enterpriseId: row.enterprise_id,
  };
}
