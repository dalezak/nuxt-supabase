import SupaModels from './SupaModels';
import Streak from './Streak';

export default class Streaks extends SupaModels {

  constructor(models = []) {
    super(Streak, models);
  }
}
