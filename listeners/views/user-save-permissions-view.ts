import type { AllMiddlewareArgs, SlackViewMiddlewareArgs } from '@slack/bolt';
import {
  setUserOverrides,
  getEffectivePermissions,
  getUserOverrides,
  emptyPermissions,
  PERMISSION_KEYS,
  type PermissionMap,
} from '../../src/permissions/engine.js';
import { revokeAllForUser } from '../../src/auth/tokens.js';
import type { KnownBlock } from '@slack/types';

/**
 * Build the home view blocks (shared logic with app-home-opened).
 * Duplicated here to avoid circular imports.
 */
function buildHomeView(userId: string, orgId: string): KnownBlock[] {
  const existing = getUserOverrides(userId, orgId);
  if (!existing) {
    setUserOverrides(userId, orgId, emptyPermissions());
  }

  const perms = getEffectivePermissions(userId, orgId);

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'MCP Orchestrator', emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Your Permissions*\nThese scopes control what AI tools can do via Slack on your behalf.',
      },
    },
  ];

  for (const key of PERMISSION_KEYS) {
    const flags = perms[key] ?? { read: false, write: false };
    const readIcon = flags.read ? ':white_check_mark:' : ':x:';
    const writeIcon = flags.write ? ':white_check_mark:' : ':x:';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${key}*\n  ${readIcon} Read   ${writeIcon} Write`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Edit Permissions', emoji: true },
        action_id: 'user_edit_permissions',
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: 'Generate MCP Config', emoji: true },
        action_id: 'user_generate_config',
        style: 'primary',
      },
    ],
  });

  return blocks;
}

/**
 * Handle submission of the "Edit Permissions" modal.
 * Persists permissions, revokes old tokens, and refreshes the Home tab.
 */
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

    // Refresh the Home tab so the user sees updated permissions immediately
    const blocks = buildHomeView(userId, orgId);
    await client.views.publish({
      user_id: userId,
      view: { type: 'home', blocks },
    });
  } catch (error) {
    logger.error(error);
  }
};
