import SupaModels from './SupaModels';
import Invite from './Invite';

export default class Invites extends SupaModels {

  constructor(models = []) {
    super(Invite, models);
  }
}
