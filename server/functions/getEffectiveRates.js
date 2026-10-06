import { createClientFromRequest } from '../shared/createClient.js';
import { getSettings } from '../shared/tenant.js';
import { calcPurityRate, sortPuritiesDescending } from '../shared/billCalc.js';
import { num, str } from '../shared/utils.js';

// Get Effective Rates — date-based rate resolution engine.
// Deterministic and backend-controlled: resolves the latest rates that were
// effective ON or BEFORE the specified date (e.g. historical bill date).
// If no rate exists on or before the date, falls back to the earliest recorded
// or active rate in ShopSettings so rates are always valid and non-zero.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dateInput = body.date || body.bill_date;

    // Normalize date to end-of-day for the selected date
    let targetDate;
    if (dateInput) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateInput))) {
        const [y, m, d] = String(dateInput).split('-').map(Number);
        targetDate = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
      } else {
        const parsed = new Date(dateInput);
        if (isNaN(parsed.getTime())) {
          return Response.json({ error: 'Invalid date format' }, { status: 400 });
        }
        targetDate = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 23, 59, 59, 999));
      }
    } else {
      targetDate = new Date();
    }

    const targetIso = targetDate.toISOString();

    const [settings, puritiesRaw, allHistory] = await Promise.all([
      getSettings(base44),
      base44.asServiceRole.entities.PurityMaster.filter({ is_active: true }, 'purity_value', 100),
      base44.asServiceRole.entities.RateHistory.list('-effective_date', 5000),
    ]);

    // Active purities separated by metal
    const goldPurities = sortPuritiesDescending(
      puritiesRaw.filter((p) => p.metal_type === 'gold' && p.is_active !== false),
      'gold'
    );
    const silverPurities = sortPuritiesDescending(
      puritiesRaw.filter((p) => p.metal_type === 'silver' && p.is_active !== false),
      'silver'
    );

    // Filter rates that were effective ON or BEFORE the target date
    const eligibleHistory = allHistory.filter((r) => {
      if (!r.effective_date) return false;
      return new Date(r.effective_date).toISOString() <= targetIso;
    });

    // Helper to resolve rates for a metal
    function resolveMetalRates(metalType, purities, fallbackBaseRate) {
      const metalEligible = eligibleHistory.filter((r) => r.metal_type === metalType);
      
      let baseRate = 0;
      let effectiveDateUsed = null;
      let rateSource = 'historical_rate';

      if (metalEligible.length > 0) {
        // Most recent effective date on or before target
        effectiveDateUsed = metalEligible[0].effective_date;

        // Collect all rates created on that exact effective timestamp or batch
        const latestBatch = metalEligible.filter((r) => r.effective_date === effectiveDateUsed);

        // First try to find base rate: 24K for gold, 999 for silver
        const basePurity = purities.find((p) => Number(p.purity_value) >= 99 || Number(p.purity_value) === 24);
        const baseDisplay = basePurity?.display_format || (metalType === 'gold' ? '24K' : '999');

        const directBase = latestBatch.find((r) => {
          if (r.purity_display && r.purity_display.trim().toUpperCase() === baseDisplay.toUpperCase()) return true;
          if (basePurity && r.purity_id === basePurity.id) return true;
          return false;
        });

        if (directBase) {
          baseRate = Number(directBase.rate_per_gram);
        } else {
          // If notes contain e.g. "24K=7200" or "999=85", parse the base rate from notes
          const noteMatch = latestBatch.map(r => r.notes).find(n => n && n.includes(`${baseDisplay}=`));
          if (noteMatch) {
            const m = noteMatch.match(new RegExp(`${baseDisplay}=([0-9.]+)`));
            if (m && Number(m[1]) > 0) {
              baseRate = Number(m[1]);
            }
          }
          if (!baseRate) {
            // If 24K was not named specifically, deduce from highest purity rate in batch
            const topRate = latestBatch[0] || metalEligible[0];
            const matchedPurity = purities.find((p) => p.display_format === topRate.purity_display || p.id === topRate.purity_id);
            const pVal = matchedPurity ? Number(matchedPurity.purity_value) : 100;
            baseRate = pVal > 0 ? (Number(topRate.rate_per_gram) * 100) / pVal : Number(topRate.rate_per_gram);
          }
        }
      }

      // If no eligible rate found before target date, do NOT silently fall back to today's rate for past dates!
      if (baseRate <= 0) {
        const isTodayOrFuture = targetDate.getTime() >= new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
        if (isTodayOrFuture && Number(fallbackBaseRate) > 0) {
          baseRate = Number(fallbackBaseRate);
          effectiveDateUsed = settings?.rate_updated_date || new Date().toISOString();
          rateSource = 'current_benchmark';
        } else {
          return { error: 'No rate is configured for the selected date.' };
        }
      }

      // Build resolved rates for all configured purities
      const resolvedPurityRates = purities.map((p) => {
        // Check if an explicit rate for this purity was recorded at effectiveDateUsed
        const explicit = metalEligible.find((r) => (
          r.effective_date === effectiveDateUsed &&
          (r.purity_id === p.id || r.purity_display === (p.display_format || p.name))
        ));

        const ratePerGram = explicit && Number(explicit.rate_per_gram) > 0
          ? Number(explicit.rate_per_gram)
          : calcPurityRate(baseRate, p.purity_value);

        return {
          purity_id: p.id,
          purity_display: p.display_format || p.name,
          purity_value: Number(p.purity_value),
          metal_type: metalType,
          rate_per_gram: ratePerGram,
          effective_date: effectiveDateUsed,
          is_base: p.display_format === (metalType === 'gold' ? '24K' : '999') || Number(p.purity_value) >= 99.9,
        };
      });

      return {
        baseRate: Math.round(baseRate * 100) / 100,
        effectiveDateUsed,
        rateSource,
        rates: resolvedPurityRates,
      };
    }

    const now = new Date();
    const goldResolution = resolveMetalRates('gold', goldPurities, settings?.gold_24k_rate);
    const silverResolution = resolveMetalRates('silver', silverPurities, settings?.silver_rate);

    if (goldResolution.error) {
      return Response.json({
        success: false,
        error: goldResolution.error,
        no_rate: true,
        query_date: dateInput || now.toISOString().slice(0, 10),
      }, { status: 404 });
    }

    const allResolvedRates = [...(goldResolution.rates || []), ...(silverResolution.rates || [])];

    return Response.json({
      success: true,
      query_date: dateInput || new Date().toISOString().slice(0, 10),
      effective_cutoff: targetIso,
      gold_24k_rate: goldResolution.baseRate,
      silver_rate: silverResolution.baseRate,
      gold_effective_date: goldResolution.effectiveDateUsed,
      silver_effective_date: silverResolution.effectiveDateUsed,
      gold_source: goldResolution.rateSource,
      silver_source: silverResolution.rateSource,
      gold_rates: goldResolution.rates,
      silver_rates: silverResolution.rates,
      rates: allResolvedRates,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
