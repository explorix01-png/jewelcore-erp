// Data access for bills. Queries only — no business rules.
const MAX_BILLS_PER_QUERY = 10000;

// Finalized, non-deleted bills dated at or after `startIso`, newest first.
// `bill_date` is always stored as a full UTC ISO string, so the text
// comparison in the entity filter orders correctly. The entity filter takes
// one operator per field, so any upper bound is applied by the caller.
export function createBillRepository(base44) {
  return {
    maxRows: MAX_BILLS_PER_QUERY,

    findFinalizedSince(startIso) {
      return base44.asServiceRole.entities.Bill.filter(
        {
          status: 'finalized',
          is_deleted: { $ne: true },
          bill_date: { $gte: startIso },
        },
        '-bill_date',
        MAX_BILLS_PER_QUERY,
      );
    },
  };
}
