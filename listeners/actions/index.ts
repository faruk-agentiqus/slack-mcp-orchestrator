import type { App } from '@slack/bolt';
import { userEditPermissionsCallback } from './user-edit-permissions.js';
import { userGenerateConfigCallback } from './user-generate-config.js';
import { adminBlockChannelCallback } from './admin-block-channel.js';
import { adminUnblockChannelCallback } from './admin-unblock-channel.js';

const register = (app: App) => {
  // User actions
  app.action('user_edit_permissions', userEditPermissionsCallback);
  app.action('user_generate_config', userGenerateConfigCallback);

  // Admin actions
  app.action('admin_block_channel', adminBlockChannelCallback);
  app.action(/^admin_unblock_channel_/, adminUnblockChannelCallback);
};

export default { register };
