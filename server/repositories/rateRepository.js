import { getSettings } from '../shared/tenant.js';

const MAX_RATE_HISTORY_ROWS = 5000;
const MAX_PURITY_ROWS = 100;

// Data access for rate resolution. Queries only — no business rules.
export function createRateRepository(base44) {
  const entities = base44.asServiceRole.entities;

  return {
    getShopSettings: () => getSettings(base44),
    listActivePurities: () => entities.PurityMaster.filter({ is_active: true }, 'purity_value', MAX_PURITY_ROWS),
    listRateHistory: () => entities.RateHistory.list('-effective_date', MAX_RATE_HISTORY_ROWS),
  };
}
