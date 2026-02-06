import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import {
  getEffectivePermissions,
  PERMISSION_KEYS,
} from '../../src/permissions/engine.js';

/**
 * Opens a modal with checkboxes so the user can toggle their own permissions.
 */
export const userEditPermissionsCallback = async ({
  ack,
  body,
  client,
  logger,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  await ack();

  try {
    const userId = (body as { user: { id: string } }).user.id;
    const orgId = context.enterpriseId ?? context.teamId ?? 'unknown';
    const current = getEffectivePermissions(userId, orgId);

    const initialOptions: Array<{
      text: { type: 'plain_text'; text: string };
      value: string;
    }> = [];
    for (const key of PERMISSION_KEYS) {
      const flags = current[key];
      if (flags?.read) {
        initialOptions.push({
          text: { type: 'plain_text', text: `${key}:read` },
          value: `${key}:read`,
        });
      }
      if (flags?.write) {
        initialOptions.push({
          text: { type: 'plain_text', text: `${key}:write` },
          value: `${key}:write`,
        });
      }
    }

    const allOptions = PERMISSION_KEYS.flatMap(key => [
      {
        text: { type: 'plain_text' as const, text: `${key}:read` },
        value: `${key}:read`,
      },
      {
        text: { type: 'plain_text' as const, text: `${key}:write` },
        value: `${key}:write`,
      },
    ]);

    await client.views.open({
      trigger_id: (body as { trigger_id: string }).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'user_save_permissions_view',
        private_metadata: JSON.stringify({ userId, orgId }),
        title: { type: 'plain_text', text: 'Edit Permissions' },
        submit: { type: 'plain_text', text: 'Save' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Select the permissions for your MCP connection.',
            },
          },
          {
            type: 'input',
            block_id: 'permissions_block',
            element: {
              type: 'checkboxes',
              action_id: 'permissions_checkboxes',
              options: allOptions,
              ...(initialOptions.length > 0
                ? { initial_options: initialOptions }
                : {}),
            },
            label: { type: 'plain_text', text: 'Permissions' },
            optional: true,
          },
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};
