import type { AllMiddlewareArgs, SlackViewMiddlewareArgs } from '@slack/bolt';
import { blockChannel } from '../../src/permissions/channels.js';
import { publishHomeView } from '../../src/views/home-builder.js';

export const adminBlockChannelViewCallback = async ({
  ack,
  view,
  client,
  logger,
}: AllMiddlewareArgs & SlackViewMiddlewareArgs) => {
  await ack();

  try {
    const { orgId, blockedBy } = JSON.parse(view.private_metadata) as {
      orgId: string;
      blockedBy: string;
    };

    const channelId =
      view.state.values.channel_block?.channel_select?.selected_channel;
    if (!channelId) return;

    const selected =
      (view.state.values.restrictions_block?.restrictions_checkboxes
        ?.selected_options as Array<{ value: string }> | undefined) ?? [];

    const blockRead = selected.some(o => o.value === 'read');
    const blockWrite = selected.some(o => o.value === 'write');

    // Resolve channel name for display
    let channelName: string | undefined;
    try {
      const info = await client.conversations.info({ channel: channelId });
      channelName = (info.channel as Record<string, unknown>)?.name as
        | string
        | undefined;
    } catch {
      // Name is optional
    }

    blockChannel(channelId, orgId, {
      channelName,
      blockRead,
      blockWrite,
      blockedBy,
    });

    // Refresh admin's Home tab
    await publishHomeView(client, blockedBy, orgId);
  } catch (error) {
    logger.error(error);
  }
};
