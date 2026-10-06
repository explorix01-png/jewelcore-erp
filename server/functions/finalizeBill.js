import { createClientFromRequest } from '../shared/createClient.js';
import { authorize, getSettings } from '../shared/tenant.js';
import { calcBill, computeDue, calcFineWeight, sortPuritiesDescending } from '../shared/billCalc.js';
import { writeAudit } from '../shared/audit.js';
import { num, str } from '../shared/utils.js';
import { db } from '../db/database.js';

// Finalize Bill — single-business server-side business action with IDEMPOTENCY.
// All referenced records are validated. No tenant scoping — the app has one business.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const auth = await authorize(base44, user, 'finalizeBill');
    if (!auth.authorized) return Response.json({ error: auth.error }, { status: auth.status });
    const { ctx } = auth;

    const body = await req.json();
    const customerId = str(body.customer_id);
    const items = Array.isArray(body.items) ? body.items : [];
    const billDiscount = num(body.bill_discount);
    const paidAmount = num(body.paid_amount);
    const paymentMode = str(body.payment_mode) || 'cash';
    const paymentComponents = Array.isArray(body.payment_components) ? body.payment_components : [];
    const paymentComponentsStr = paymentComponents.length > 0 ? JSON.stringify(paymentComponents) : '';
    const notes = str(body.notes);
    const billSourceRaw = str(body.bill_source);
    const billSource = ['inventory', 'manual', 'customer_purchase'].includes(billSourceRaw) ? billSourceRaw : 'inventory';
    const gstEnabled = body.gst_enabled !== false;
    const gstMode = ['intra', 'inter', 'none'].includes(str(body.gst_mode)) ? str(body.gst_mode) : 'intra';
    const otherCharges = num(body.other_charges);
    const aadhaarNumber = str(body.aadhaar_number);
    const panNumber = str(body.pan_number);
    const operationId = str(body.operation_id) || `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // Custom bill date — admin can select a historical/business date. Falls back to now.
    const customBillDate = str(body.bill_date);
    const billDateIso = customBillDate ? new Date(customBillDate).toISOString() : new Date().toISOString();
    const customRateOverride = body.custom_rate_override === true;

    // --- IDEMPOTENCY CHECK ---
    const existing = await base44.asServiceRole.entities.Bill.filter(
      { operation_id: operationId }, '-created_date', 1
    );
    if (existing.length > 0 && existing[0].status === 'finalized') {
      const bill = existing[0];
      return Response.json({ success: true, bill_id: bill.id, bill_number: bill.bill_number,
        total_amount: bill.total_amount, paid_amount: bill.paid_amount, due_amount: bill.due_amount,
        idempotent: true, message: 'Bill already finalized for this operation' });
    }

    // --- VALIDATION ---
    if (!customerId) return Response.json({ error: 'Customer is required' }, { status: 400 });
    if (items.length === 0) return Response.json({ error: 'At least one item is required' }, { status: 400 });
    if (paidAmount < 0) return Response.json({ error: 'Invalid paid amount' }, { status: 400 });

    const customer = await base44.asServiceRole.entities.Customer.get(customerId).catch(() => null);
    if (!customer || customer.is_deleted) return Response.json({ error: 'Invalid or deleted customer' }, { status: 400 });

    // Inventory validation (inventory billing only)
    const inventoryMap = new Map();
    if (billSource === 'inventory') {
      for (const it of items) {
        const invId = str(it.inventory_id || it.item_id);
        if (!invId) continue;
        if (!inventoryMap.has(invId)) {
          const inv = await base44.asServiceRole.entities.InventoryItem.get(invId).catch(() => null);
          if (inv) inventoryMap.set(invId, inv);
        }
      }
      for (const it of items) {
        const invId = str(it.inventory_id || it.item_id);
        const inv = inventoryMap.get(invId);
        const itemName = str(it.item_name || it.description || 'item');
        if (!inv) return Response.json({ error: `Inventory not found for ${itemName}` }, { status: 400 });
        if (num(it.quantity) <= 0) return Response.json({ error: `Invalid quantity for ${itemName}` }, { status: 400 });
        if (Number(inv.quantity) < num(it.quantity)) return Response.json({ error: `Insufficient stock for ${itemName} (available: ${inv.quantity})` }, { status: 400 });
      }
    } else {
      // manual + customer_purchase: items need name, quantity, net weight
      for (const it of items) {
        if (num(it.quantity) <= 0) return Response.json({ error: `Invalid quantity for ${str(it.item_name)}` }, { status: 400 });
        if (num(it.net_weight) <= 0) return Response.json({ error: `Net weight required for ${str(it.item_name)}` }, { status: 400 });
      }
    }

    // Shop settings
    const settings = await getSettings(base44);
    if (!settings) return Response.json({ error: 'Shop settings not configured' }, { status: 400 });

    // Rates — resolve effective rate on or before billDateIso
    const allHistory = await base44.asServiceRole.entities.RateHistory.list('-effective_date', 5000);
    const eligibleRates = allHistory.filter((r) => r.effective_date && new Date(r.effective_date).toISOString() <= billDateIso);
    
    // Check if date has no valid rate
    const hasExplicitItemRates = items.length > 0 && items.every(it => num(it.rate_per_gram) > 0);
    if (eligibleRates.length === 0 && !customRateOverride) {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
      const isTodayOrFuture = new Date(billDateIso).getTime() >= todayStart;
      if (!isTodayOrFuture) {
        return Response.json({ error: 'No rate is configured for the selected date.' }, { status: 400 });
      }
      if (!settings?.gold_24k_rate && !hasExplicitItemRates) {
        return Response.json({ error: 'No rate is configured for today.' }, { status: 400 });
      }
    }
    const ratePool = eligibleRates.length > 0 ? eligibleRates : allHistory;

    // Purities lookup for fine weight calculation (sorted descending, 24K first)
    const puritiesRaw = await base44.asServiceRole.entities.PurityMaster.filter({ is_active: true }, 'purity_value', 100);
    const purities = sortPuritiesDescending(puritiesRaw, 'gold');
    const purityMap = new Map(purities.map(p => [`${p.metal_type}:${p.display_format}`, p]));

    // Find latest effective base rate for each metal
    const baseGoldPurity = purities.find(p => p.metal_type === 'gold' && (Number(p.purity_value) >= 99 || Number(p.purity_value) === 24));
    const latestGold24k = ratePool.find(r => r.metal_type === 'gold' && (
      (r.purity_display && r.purity_display.toUpperCase().startsWith('24K')) ||
      (baseGoldPurity && r.purity_id === baseGoldPurity.id)
    )) || ratePool.find(r => r.metal_type === 'gold');

    const baseSilverPurity = purities.find(p => p.metal_type === 'silver' && Number(p.purity_value) >= 99);
    const latestSilver999 = ratePool.find(r => r.metal_type === 'silver' && (
      (r.purity_display && r.purity_display.includes('999')) ||
      (baseSilverPurity && r.purity_id === baseSilverPurity.id)
    )) || ratePool.find(r => r.metal_type === 'silver');

    const effectiveGold24k = latestGold24k ? Number(latestGold24k.rate_per_gram) : (Number(settings?.gold_24k_rate) || 0);
    const effectiveSilver999 = latestSilver999 ? Number(latestSilver999.rate_per_gram) : (Number(settings?.silver_rate) || 0);

    const rateSnapshot = {
      bill_date: billDateIso,
      effective_date: latestGold24k?.effective_date || billDateIso,
      gold_24k_rate: effectiveGold24k,
      silver_rate: effectiveSilver999,
      rates: ratePool.slice(0, 30).map((r) => ({ metal: r.metal_type, purity: r.purity_display, rate: r.rate_per_gram })),
    };

    // Gold Exchange / Gold Given data validation & preparation
    const rawExchange = body.gold_exchange || (body.use_old_gold ? body.old_gold : null);
    let goldExchangeData = null;
    let goldGivenValue = 0;

    if (rawExchange) {
      const gw = num(rawExchange.gross_weight ?? rawExchange.grossWeight);
      const lw = num(rawExchange.less_weight ?? rawExchange.deduction_weight ?? rawExchange.deductionWeight);
      const nw = num(rawExchange.net_weight ?? rawExchange.netWeight) || Math.max(0, gw - lw);
      const pVal = num(rawExchange.purity_value ?? rawExchange.purityValue);
      const pDisplay = str(rawExchange.purity || rawExchange.purity_display);
      let resolvedPurityValue = pVal;
      if (resolvedPurityValue <= 0 && pDisplay) {
        const matched = purities.find(p => p.display_format?.toUpperCase() === pDisplay.toUpperCase() || p.name?.toUpperCase() === pDisplay.toUpperCase());
        if (matched) resolvedPurityValue = Number(matched.purity_value);
      }
      const fineWt = calcFineWeight(nw, resolvedPurityValue);
      const ratePerG = num(rawExchange.rate_per_gram ?? rawExchange.ratePerGram);
      const val = num(rawExchange.gold_value ?? rawExchange.exchange_value ?? rawExchange.exchangeValue) || Math.round(nw * ratePerG);

      if (gw > 0 && nw > 0) {
        if (lw < 0 || lw > gw) {
          return Response.json({ error: 'Gold exchange: Less weight cannot be negative or exceed gross weight' }, { status: 400 });
        }
        if (ratePerG <= 0 && val <= 0) {
          return Response.json({ error: 'Gold exchange: Rate per gram must be greater than zero' }, { status: 400 });
        }
        goldGivenValue = val;
        goldExchangeData = {
          item_type: str(rawExchange.item_type || rawExchange.item || 'Gold Given'),
          metal: str(rawExchange.metal || 'gold'),
          gross_weight: gw,
          less_weight: lw,
          net_weight: nw,
          purity: pDisplay || `${resolvedPurityValue}%`,
          purity_value: resolvedPurityValue,
          fine_weight: fineWt,
          rate_per_gram: ratePerG,
          gold_value: val,
          huid: str(rawExchange.huid),
          barcode: str(rawExchange.barcode),
          notes: str(rawExchange.notes),
        };
      }
    }

    const normalizedItems = items.map((it) => {
      let rate = num(it.rate_per_gram);
      if (rate <= 0) {
        const r = ratePool.find((x) => x.metal_type === it.metal_type && (!it.purity_display || x.purity_display === it.purity_display));
        rate = r ? Number(r.rate_per_gram) : 0;
      }
      const purityKey = `${it.metal_type}:${it.purity_display || ''}`;
      const purity = purityMap.get(purityKey);
      // Use user-provided purity_value (customer_purchase mode) or fall back to PurityMaster lookup
      const purityValue = num(it.purity_value) > 0 ? num(it.purity_value) : (purity ? Number(purity.purity_value) : 0);
      const inv = billSource === 'inventory' ? inventoryMap.get(str(it.inventory_id)) : null;
      const huid = inv?.huid || str(it.huid) || '';
      return { ...it, rate_per_gram: rate, hallmarking_charge: num(it.hallmarking_charge), stone_weight: num(it.stone_weight), purity_value: purityValue, huid };
    });
    for (const it of normalizedItems) {
      if (num(it.rate_per_gram) <= 0) return Response.json({ error: `No rate available for ${str(it.item_name)}` }, { status: 400 });
    }

    // GST config
    const gstConfigs = await base44.asServiceRole.entities.GSTConfig.filter(
      { is_active: true }, '-created_date', 5
    );
    const gstConfig = gstConfigs[0] || null;
    const effectiveGstRate = gstEnabled && gstConfig ? Number(gstConfig.gst_rate) : 0;

    // Authoritative calculation
    const calc = calcBill(normalizedItems, billDiscount, gstConfig, { gst_enabled: gstEnabled, gst_mode: gstMode, other_charges: otherCharges });
    const totalSettled = paidAmount;
    const due = computeDue(calc.totalAmount, totalSettled);
    if (paidAmount > calc.totalAmount) return Response.json({ error: 'Paid amount exceeds total' }, { status: 400 });

    // Bill number — from settings
    const baseSeq = Number(settings.invoice_sequence) || 0;
    let billNumber = '', usedSeq = baseSeq;
    for (let attempt = 0; attempt < 5; attempt++) {
      usedSeq = baseSeq + 1 + attempt;
      billNumber = `${settings.invoice_prefix || 'INV'}-${usedSeq.toString().padStart(5, '0')}`;
      const coll = await base44.asServiceRole.entities.Bill.filter({ bill_number: billNumber }, '-created_date', 1);
      if (coll.length === 0) break;
      if (attempt === 4) return Response.json({ error: 'Bill number collision after 5 retries' }, { status: 409 });
    }

    // --- WRITE PHASE (ATOMIC POSTGRESQL TRANSACTION) ---
    const tokenBuf = new Uint8Array(16);
    crypto.getRandomValues(tokenBuf);
    const publicToken = Array.from(tokenBuf).map((b) => b.toString(16).padStart(2, '0')).join('');

    try {
      const txResult = await db.transaction(async (tx) => {
        const txBase44 = createClientFromRequest(req, { txClient: tx });

        const bill = await txBase44.asServiceRole.entities.Bill.create({
          bill_number: billNumber, customer_id: customerId, customer_name: customer.name,
          customer_mobile: customer.mobile || '', customer_gst_number: customer.gst_number || '', customer_state: customer.state || '',
          bill_date: billDateIso, bill_source: billSource,
          subtotal: calc.subtotal, discount: calc.discount, other_charges: otherCharges, hallmarking_charge: calc.hallmarkingTotal,
          gst_enabled: gstEnabled, gst_mode: calc.gstMode, gst_rate_snapshot: effectiveGstRate,
          cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst, total_amount: calc.totalAmount,
          paid_amount: paidAmount, due_amount: due, payment_mode: paymentMode,
          payment_components: paymentComponentsStr, custom_rate_override: customRateOverride,
          aadhaar_number: aadhaarNumber, pan_number: panNumber,
          rate_snapshot: JSON.stringify(rateSnapshot), operation_id: operationId, status: 'finalized', notes,
          public_token: publicToken,
          gold_exchange: goldExchangeData ? JSON.stringify(goldExchangeData) : null,
          gold_given_value: goldGivenValue,
          jewellery_value: calc.subtotal,
        });

        const billItems = calc.items.map((c) => ({
          bill_id: bill.id,
          inventory_id: str(c.inventory_id || c.item_id || ''),
          item_id: str(c.item_id || c.inventory_id || ''),
          item_name: str(c.item_name),
          item_code: str(c.item_code),
          huid: str(c.huid || ''),
          category_name: str(c.category_name), metal_type: c.metal_type, purity_display: str(c.purity_display),
          purity_value: num(c.purity_value), fine_weight: calcFineWeight(num(c.net_weight), num(c.purity_value)),
          hsn: str(c.hsn), quantity: num(c.quantity), gross_weight: num(c.gross_weight),
          stone_weight: num(c.stone_weight), net_weight: num(c.net_weight), wastage: num(c.wastage),
          wastage_type: c.wastage_type || undefined, wastage_weight: num(c.wastage_weight), chargeable_weight: num(c.chargeable_weight),
          rate_per_gram: num(c.rate_per_gram), making_charge: num(c.making_charge),
          making_charge_type: c.making_charge_type || 'percentage', hallmarking_charge: num(c.hallmarking_charge),
          discount: num(c.discount), gst_rate: effectiveGstRate,
          metal_value: c.metal_value, making_amount: c.making_amount, taxable_amount: c.taxable_amount,
          gst_amount: num(c.gst_amount), total: c.total,
        }));
        await txBase44.asServiceRole.entities.BillItem.bulkCreate(billItems);

        // Record customer gold exchange transaction if gold was given
        if (goldExchangeData && goldGivenValue > 0) {
          const exchangeNum = `EXC-${Date.now().toString().slice(-6)}`;
          await txBase44.asServiceRole.entities.ExchangeTransaction.create({
            exchange_number: exchangeNum,
            transaction_type: 'CUSTOMER_GOLD_EXCHANGE',
            original_bill_id: bill.id,
            original_bill_number: billNumber,
            customer_id: customerId,
            customer_name: customer.name,
            old_item_details: JSON.stringify(goldExchangeData),
            exchange_value: goldGivenValue,
            difference_amount: due,
            exchange_date: billDateIso,
            user_name: user.full_name || user.email || '',
            operation_id: operationId,
            notes: `Gold Given / Settlement on bill ${billNumber}: ${goldExchangeData.item_type || 'Gold'} (${goldExchangeData.net_weight}g, ${goldExchangeData.purity})`,
          });
        }

        if (paidAmount > 0) {
          await txBase44.asServiceRole.entities.Payment.create({
            bill_id: bill.id, bill_number: billNumber, customer_id: customerId, customer_name: customer.name,
            amount: paidAmount, payment_mode: paymentMode, payment_date: billDateIso,
            payment_components: paymentComponentsStr,
            operation_id: operationId, user_name: user.full_name || user.email || '',
          });
        }

        if (due > 0) {
          await txBase44.asServiceRole.entities.CustomerOutstanding.create({
            customer_id: customerId, customer_name: customer.name, bill_id: bill.id, bill_number: billNumber,
            amount: due, status: 'open', created_date: new Date().toISOString(),
          });
          await txBase44.asServiceRole.entities.Customer.update(customerId, { outstanding: (Number(customer.outstanding) || 0) + due });
        }

        if (billSource === 'inventory') {
          for (const c of calc.items) {
            const inv = inventoryMap.get(str(c.inventory_id));
            if (!inv) continue;
            const prev = Number(inv.quantity) || 0;
            const qty = num(c.quantity);
            const newQty = prev - qty;
            const newNetWt = Math.max(0, (Number(inv.net_weight) || 0) - num(c.net_weight) * qty);
            await txBase44.asServiceRole.entities.InventoryItem.update(inv.id, {
              quantity: newQty,
              gross_weight: Math.max(0, (Number(inv.gross_weight) || 0) - num(c.gross_weight) * qty),
              net_weight: newNetWt,
              fine_weight: calcFineWeight(newNetWt, Number(inv.purity_value) || 0),
              status: newQty <= 0 ? 'out_of_stock' : newQty <= 2 ? 'low_stock' : 'in_stock',
            });
            await txBase44.asServiceRole.entities.InventoryTransaction.create({
              item_id: str(c.item_id), item_name: str(c.item_name), transaction_type: 'SALE_OUT',
              quantity: qty, gross_weight: num(c.gross_weight) * qty, net_weight: num(c.net_weight) * qty,
              reference_type: 'bill', reference_id: bill.id, reason: 'Sale ' + billNumber,
              previous_stock: prev, new_stock: newQty, date: billDateIso, user_name: user.full_name || user.email || '',
            });
          }
        }

        await txBase44.asServiceRole.entities.ShopSettings.update(settings.id, { invoice_sequence: usedSeq });

        await writeAudit(txBase44, {
          action: 'create', module: 'billing', record_id: bill.id,
          new_value: { bill_number: billNumber, total: calc.totalAmount, due, source: billSource, gst: gstEnabled },
          user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
        });

        return {
          success: true,
          bill_id: bill.id,
          bill_number: billNumber,
          total_amount: calc.totalAmount,
          paid_amount: paidAmount,
          due_amount: due,
          operation_id: operationId,
          public_token: publicToken
        };
      });

      return Response.json(txResult);
    } catch (writeError) {
      await writeAudit(base44, {
        action: 'error', module: 'billing', record_id: billNumber,
        new_value: { bill_number: billNumber, error: writeError.message, operation_id: operationId },
        reason: 'Bill finalization rolled back in transaction',
        user_id: user.id, user_name: user.full_name || user.email || '', user_role: ctx.role,
      }).catch(() => {});
      return Response.json({ error: `Bill finalization failed: ${writeError.message}`, operation_id: operationId }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}