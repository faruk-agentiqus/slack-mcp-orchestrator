import type { AllMiddlewareArgs, SlackViewMiddlewareArgs } from '@slack/bolt';
import {
  setUserOverrides,
  PERMISSION_KEYS,
  type PermissionMap,
} from '../../src/permissions/engine.js';
import { revokeAllForUser } from '../../src/auth/tokens.js';
import { publishHomeView } from '../../src/views/home-builder.js';

export const userSavePermissionsViewCallback = async ({
  ack,
  view,
  client,
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
    revokeAllForUser(userId, orgId);

    // Refresh the Home tab immediately
    await publishHomeView(client, userId, orgId);
  } catch (error) {
    logger.error(error);
  }
};
