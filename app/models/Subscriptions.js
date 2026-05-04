import SupaModels from './SupaModels';
import Subscription from './Subscription';

export default class Subscriptions extends SupaModels {

  constructor(models = []) {
    super(Subscription, models);
  }
}
