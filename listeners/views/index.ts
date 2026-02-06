import type { App } from '@slack/bolt';
import { userSavePermissionsViewCallback } from './user-save-permissions-view.js';
import { adminBlockChannelViewCallback } from './admin-block-channel-view.js';

const register = (app: App) => {
  app.view('user_save_permissions_view', userSavePermissionsViewCallback);
  app.view('admin_block_channel_view', adminBlockChannelViewCallback);
};

export default { register };
