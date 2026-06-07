import SupaModel from './SupaModel';
import SupaModels from './SupaModels';

// One row of the `cache_manifest` view — a freshness fingerprint for a single
// cacheable reference table. NOT cached itself (it IS the freshness oracle, so
// it's always fetched fresh). See use-cache-manifest for how it's consumed.
export default class CacheManifest extends SupaModel {

  table_name = null;
  updated_at = null;   // max(updated_at) for the table (a string from PostgREST)
  row_count = null;    // count(*) for the table

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }

  // All rows of the view — one per cacheable table. The app's `cache_manifest`
  // override decides which tables appear; the stub returns none.
  static async loadAll() {
    return SupaModels.loadModels(SupaModels, CacheManifest, 'cache_manifest', { limit: 1000 });
  }
}
