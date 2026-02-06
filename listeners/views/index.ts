import type { App } from '@slack/bolt';
import { sampleViewCallback } from './sample-view.js';
import { userSavePermissionsViewCallback } from './user-save-permissions-view.js';

const register = (app: App) => {
  app.view('sample_view_id', sampleViewCallback);
  app.view('user_save_permissions_view', userSavePermissionsViewCallback);
};

export default { register };
