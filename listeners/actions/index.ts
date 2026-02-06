import type { App } from '@slack/bolt';
import { userEditPermissionsCallback } from './user-edit-permissions.js';
import { userGenerateConfigCallback } from './user-generate-config.js';

const register = (app: App) => {
  app.action('user_edit_permissions', userEditPermissionsCallback);
  app.action('user_generate_config', userGenerateConfigCallback);
};

export default { register };
