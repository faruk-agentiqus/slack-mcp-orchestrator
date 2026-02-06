import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { getDatabase } from '../../src/db/database.js';

/**
 * Handle the app_uninstalled event.
 * Cleans up all data for the uninstalled workspace/org:
 * - Deletes the installation record
 * - Revokes all tokens for that org
 * - Deletes all user permissions for that org
 */
const appUninstalledCallback = async ({
  context,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_uninstalled'>) => {
  const orgId = context.enterpriseId ?? context.teamId;
  if (!orgId) {
    logger.warn('app_uninstalled event received without org or team ID');
    return;
  }

  try {
    const db = getDatabase();

    // Delete installation records
    db.prepare(
      'DELETE FROM installations WHERE enterprise_id = ? OR team_id = ?'
    ).run(orgId, orgId);

    // Revoke all tokens for this org
    db.prepare(
      'UPDATE tokens SET is_revoked = 1 WHERE org_id = ? AND is_revoked = 0'
    ).run(orgId);

    // Delete all user permissions for this org
    db.prepare('DELETE FROM user_permissions WHERE org_id = ?').run(orgId);

    // Delete org defaults
    db.prepare('DELETE FROM org_defaults WHERE org_id = ?').run(orgId);

    logger.info(`Cleaned up all data for uninstalled org: ${orgId}`);
  } catch (error) {
    logger.error('Failed to clean up after uninstall', error);
  }
};

export { appUninstalledCallback };
