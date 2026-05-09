import SupaModels from './SupaModels';
import Notification from './Notification';

export default class Notifications extends SupaModels {

  constructor(models = []) {
    super(Notification, models);
  }
}
