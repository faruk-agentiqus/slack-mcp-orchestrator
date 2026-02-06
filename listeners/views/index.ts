import type { App } from '@slack/bolt';
import { userSavePermissionsViewCallback } from './user-save-permissions-view.js';

const register = (app: App) => {
  app.view('user_save_permissions_view', userSavePermissionsViewCallback);
};

export default { register };
