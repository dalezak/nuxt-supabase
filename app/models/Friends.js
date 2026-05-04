import SupaModels from './SupaModels';
import Friend from './Friend';

export default class Friends extends SupaModels {

  constructor(models = []) {
    super(Friend, models);
  }
}
