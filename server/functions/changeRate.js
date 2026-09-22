import { createClientFromRequest } from '../shared/createClient.js';
import { authorize, getSettings } from '../shared/tenant.js';
import { calcPurityRate } from '../shared/billCalc.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';

// Change Rate — single-business 24K GOLD RATE MODEL.
// Admin enters ONLY the 24K gold rate. System calculates all other purity rates
// from PurityMaster (purity_value / 24 × 24k_rate). Silver rate entered separately.
// Historical rates remain immutable: deactivates previous active rates, creates new ones.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'changeRate');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const rate24k = num(body.gold_24k_rate);
    const silverRate = num(body.silver_rate);

    if (rate24k <= 0 && silverRate <= 0)
      return Response.json({ error: 'At least one rate (24K gold or silver) is required' }, { status: 400 });

    const settings = await getSettings(base44);
    if (!settings) return Response.json({ error: 'Shop settings not found' }, { status: 400 });

    const createdRates = [];

    // --- GOLD: 24K model — calculate all purities from PurityMaster ---
    if (rate24k > 0) {
      const goldPurities = await base44.asServiceRole.entities.PurityMaster.filter(
        { metal_type: 'gold', is_active: true }
      );
      if (goldPurities.length === 0)
        return Response.json({ error: 'No gold purities configured. Please configure PurityMaster first.' }, { status: 400 });

      // Deactivate previous active gold rates (history stays immutable)
      const existingGoldRates = await base44.asServiceRole.entities.RateHistory.filter(
        { is_active: true, metal_type: 'gold' }
      );
      for (const r of existingGoldRates) {
        await base44.asServiceRole.entities.RateHistory.update(r.id, { is_active: false });
      }

      // Create new RateHistory for each gold purity
      for (const p of goldPurities) {
        const rate = calcPurityRate(rate24k, p.purity_value);
        await base44.asServiceRole.entities.RateHistory.create({
          metal_type: 'gold', purity_id: p.id,
          purity_display: p.display_format || p.name, rate_per_gram: rate,
          effective_date: new Date().toISOString(), source: 'manual',
          is_manual_override: true, is_active: true,
          notes: `24K=${rate24k}, ${p.purity_value}K=${rate}`,
        });
        createdRates.push({ purity: p.display_format || p.name, purity_value: p.purity_value, rate });
      }
    }

    // --- SILVER: 999 base model — calculate all purities from PurityMaster ---
    if (silverRate > 0) {
      const silverPurities = await base44.asServiceRole.entities.PurityMaster.filter(
        { metal_type: 'silver', is_active: true }
      );
      if (silverPurities.length === 0)
        return Response.json({ error: 'No silver purities configured. Please configure PurityMaster first.' }, { status: 400 });

      // Deactivate previous active silver rates (history stays immutable)
      const existingSilver = await base44.asServiceRole.entities.RateHistory.filter(
        { is_active: true, metal_type: 'silver' }
      );
      for (const r of existingSilver) {
        await base44.asServiceRole.entities.RateHistory.update(r.id, { is_active: false });
      }

      // Create new RateHistory for each silver purity
      for (const p of silverPurities) {
        const rate = calcPurityRate(silverRate, p.purity_value);
        await base44.asServiceRole.entities.RateHistory.create({
          metal_type: 'silver', purity_id: p.id,
          purity_display: p.display_format || p.name, rate_per_gram: rate,
          effective_date: new Date().toISOString(), source: 'manual',
          is_manual_override: true, is_active: true,
          notes: `999=${silverRate}, ${p.display_format || p.name}=${rate}`,
        });
        createdRates.push({ metal: 'silver', purity: p.display_format || p.name, purity_value: p.purity_value, rate });
      }
    }

    // Update ShopSettings
    const updateData = { rate_updated_date: new Date().toISOString() };
    if (rate24k > 0) updateData.gold_24k_rate = rate24k;
    if (silverRate > 0) updateData.silver_rate = silverRate;
    await base44.asServiceRole.entities.ShopSettings.update(settings.id, updateData);

    await writeAudit(base44, {
      action: 'rate_change', module: 'rates',
      new_value: { gold_24k_rate: rate24k, silver_rate: silverRate, calculated_rates: createdRates },
      user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
    });

    return Response.json({ success: true, gold_24k_rate: rate24k, silver_rate: silverRate, calculated_rates: createdRates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}