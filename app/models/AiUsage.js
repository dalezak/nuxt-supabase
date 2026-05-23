import SupaModel from './SupaModel';

// AI usage row — one per Edge Function call that consumes a Claude/OpenAI
// budget unit. Inserted server-side by `enforceMonthlyBudget` in
// `_shared/edge.ts`; clients only ever read aggregate counts (e.g. for
// the "X of N this month" usage card on the Profile surface).
//
// Kept lean — the client doesn't open individual rows.

export default class AiUsage extends SupaModel {

  id = null;
  user_id = null;
  function_name = null;
  created_at = null;

  constructor(data = {}) {
    super(data);
    Object.assign(this, data);
  }
}
