import type { App } from '@slack/bolt';
import { userSavePermissionsViewCallback } from './user-save-permissions-view.js';
import { adminBlockChannelViewCallback } from './admin-block-channel-view.js';

const register = (app: App) => {
  app.view('user_save_permissions_view', userSavePermissionsViewCallback);
  app.view('admin_block_channel_view', adminBlockChannelViewCallback);

  // No-op handler for the config modal submit (it's display-only)
  app.view('user_config_modal', async ({ ack }) => { await ack(); });
};

export default { register };
