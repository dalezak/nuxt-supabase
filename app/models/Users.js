import SupaModels from "./SupaModels";
import User from "./User";

export default class Users extends SupaModels {

  constructor(models = []) {
    super(User, models);
  }

  static async clear() {
    return this.clearModels("users");
  }

  // Returns count from local storage — used by createSupaStore cache check.
  static async stored(search = "", _params = {}) {
    return this.storedModels("users/", search, "name");
  }

  static async count(search = "", _params = {}) {
    const where = search?.length > 0 ? [["name", "ilike", search]] : [];
    return SupaModels.countModels("users", where);
  }

  static async restore(limit = 10, offset = 0, search = "", params = {}) {
    return this.restoreModels(Users, User, "users/", search, offset, limit, params);
  }

  static async load(limit = 10, offset = 0, search = "", _params = {}) {
    let where = [];
    if (search && search.length > 0) {
      where.push(["name", "ilike", search.toLowerCase()]);
    }
    return this.loadModels(Users, User, "users", {
      order: "created_at:desc",
      limit: limit,
      offset: offset,
      where: where
    });
  }

  // Bulk-load users by id — used by activity-feed hydration and other
  // surfaces that have a list of user ids and need name/email/avatar.
  // Pass `select` to narrow the projection when only a few columns are
  // needed (e.g. `'id, name, avatar_url'`). Returns an empty Users
  // collection on an empty input (no round-trip).
  static async loadByIds(ids, { select = "*" } = {}) {
    if (!ids?.length) return new Users();
    return this.loadModels(Users, User, "users", {
      select,
      where: [["id", "in", ids]],
      limit: ids.length,
    });
  }

}