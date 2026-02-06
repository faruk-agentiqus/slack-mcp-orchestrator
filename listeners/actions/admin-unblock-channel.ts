import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from '@slack/bolt';
import { unblockChannel } from '../../src/permissions/channels.js';
import { isAdmin } from '../../src/permissions/admin.js';
import { publishHomeView } from '../../src/views/home-builder.js';

export const adminUnblockChannelCallback = async ({
  ack,
  body,
  action,
  client,
  logger,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  await ack();

  try {
    const userId = (body as { user: { id: string } }).user.id;

    if (!(await isAdmin(client, userId))) return;

    const orgId = context.enterpriseId ?? context.teamId ?? 'unknown';
    const channelId = (action as unknown as { value?: string }).value;
    if (!channelId) return;

    unblockChannel(channelId, orgId);

    // Refresh admin's Home tab
    await publishHomeView(client, userId, orgId);
  } catch (error) {
    logger.error(error);
  }
};
