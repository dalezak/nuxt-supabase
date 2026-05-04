import SupaModels from './SupaModels';
import Award from './Award';

export default class Awards extends SupaModels {

  constructor(models = []) {
    super(Award, models);
  }
}
