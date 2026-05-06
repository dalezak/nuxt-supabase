import SupaModels from './SupaModels';
import NotificationPreference from './NotificationPreference';

export default class NotificationPreferences extends SupaModels {

  constructor(models = []) {
    super(NotificationPreference, models);
  }
}
