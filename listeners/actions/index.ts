import type { App } from '@slack/bolt';
import { sampleActionCallback } from './sample-action.js';
import { userEditPermissionsCallback } from './user-edit-permissions.js';
import { userGenerateConfigCallback } from './user-generate-config.js';

const register = (app: App) => {
  app.action('sample_action_id', sampleActionCallback);
  app.action('user_edit_permissions', userEditPermissionsCallback);
  app.action('user_generate_config', userGenerateConfigCallback);
};

export default { register };
