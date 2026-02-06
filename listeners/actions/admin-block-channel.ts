import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { isAdmin } from '../../src/permissions/admin.js';

/**
 * Opens a modal for admins to select a channel to block.
 */
export const adminBlockChannelCallback = async ({
  ack,
  body,
  client,
  logger,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  await ack();

  try {
    const userId = (body as { user: { id: string } }).user.id;

    // Verify admin
    if (!(await isAdmin(client, userId))) {
      return;
    }

    const orgId = context.enterpriseId ?? context.teamId ?? 'unknown';

    await client.views.open({
      trigger_id: (body as { trigger_id: string }).trigger_id,
      view: {
        type: 'modal',
        callback_id: 'admin_block_channel_view',
        private_metadata: JSON.stringify({ orgId, blockedBy: userId }),
        title: { type: 'plain_text', text: 'Block a Channel' },
        submit: { type: 'plain_text', text: 'Block' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Select a channel to block. No user in the org will be able to access it via MCP.',
            },
          },
          {
            type: 'input',
            block_id: 'channel_block',
            label: { type: 'plain_text', text: 'Channel' },
            element: {
              type: 'channels_select',
              action_id: 'channel_select',
              placeholder: { type: 'plain_text', text: 'Select a channel' },
            },
          },
          {
            type: 'input',
            block_id: 'restrictions_block',
            label: { type: 'plain_text', text: 'What to block' },
            element: {
              type: 'checkboxes',
              action_id: 'restrictions_checkboxes',
              options: [
                {
                  text: { type: 'plain_text', text: 'Block reading messages' },
                  value: 'read',
                },
                {
                  text: { type: 'plain_text', text: 'Block writing messages' },
                  value: 'write',
                },
              ],
              initial_options: [
                {
                  text: { type: 'plain_text', text: 'Block reading messages' },
                  value: 'read',
                },
                {
                  text: { type: 'plain_text', text: 'Block writing messages' },
                  value: 'write',
                },
              ],
            },
          },
        ],
      },
    });
  } catch (error) {
    logger.error(error);
  }
};
