import type { AllMiddlewareArgs, SlackViewMiddlewareArgs } from '@slack/bolt';
import {
  setUserOverrides,
  PERMISSION_KEYS,
  type PermissionMap,
} from '../../src/permissions/engine.js';
import { revokeAllForUser } from '../../src/auth/tokens.js';

/**
 * Handle submission of the "Edit Permissions" modal.
 * Persists the user's selected permissions and revokes existing tokens
 * (so the next generated config reflects the new permissions).
 */
export const userSavePermissionsViewCallback = async ({
  ack,
  view,
  logger,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs) => {
  await ack();

  try {
    const { userId, orgId } = JSON.parse(view.private_metadata) as {
      userId: string;
      orgId: string;
    };

    const selected =
      (view.state.values.permissions_block?.permissions_checkboxes
        ?.selected_options as Array<{ value: string }> | undefined) ?? [];

    const permissions: PermissionMap = {};
    for (const key of PERMISSION_KEYS) {
      permissions[key] = { read: false, write: false };
    }
    for (const opt of selected) {
      const [key, op] = opt.value.split(':');
      if (permissions[key] && (op === 'read' || op === 'write')) {
        permissions[key][op] = true;
      }
    }

    setUserOverrides(userId, orgId, permissions);

    // Revoke old tokens so the user must regenerate with new permissions
    revokeAllForUser(userId, orgId);
  } catch (error) {
    logger.error(error);
  }
};
