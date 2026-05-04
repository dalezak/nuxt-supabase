import SupaModels from './SupaModels';
import Kudo from './Kudo';

export default class Kudos extends SupaModels {

  constructor(models = []) {
    super(Kudo, models);
  }
}
