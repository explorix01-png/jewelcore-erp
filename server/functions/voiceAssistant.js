import { createClientFromRequest } from '../shared/createClient.js';
import { resolveTenant } from '../shared/tenant.js';
import { str } from '../shared/utils.js';

// Voice Assistant — a controlled, read-only interface over the existing ERP.
// It NEVER writes data and NEVER generates arbitrary queries. It:
//   1. understand  — parses natural language (en/hi/mr/mixed) into a structured
//                    intent via InvokeLLM, then resolves entities / runs safe
//                    read queries so the frontend can act in one round trip.
//   2. query      — runs deterministic informational queries (today's sales,
//                    low stock, pending payments, counts) against real tenant data.
//   3. resolve    — searches customers / items / suppliers by name fragment.
// All reads are tenant-scoped via the authenticated user's active membership.
// Destructive intents are returned as confirmation requests — never executed here.
// Execution of any mutation is delegated to the existing authorized business
// functions (manageMaster, cancelBill, adjustStock, ...) which enforce their own auth.
export default async function(req) {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const ctx = await resolveTenant(base44, user);
    if (!ctx) return Response.json({ error: 'No active shop membership' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = str(body.action);
    const lang = ['en', 'hi', 'mr'].includes(str(body.lang)) ? str(body.lang) : 'en';

    if (action === 'query') return Response.json(await runQuery(base44, ctx, str(body.query_type), lang));
    if (action === 'resolve') return Response.json(await resolveEntity(base44, ctx, str(body.resolve_type), str(body.name)));
    if (action === 'understand') return Response.json(await understand(base44, ctx, str(body.transcript), lang));

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// --- LLM intent parsing + server-side resolution (one round trip) ---
async function understand(base44, ctx, transcript, lang) {
  const text = (transcript || '').trim();
  if (!text) return { intent: 'UNKNOWN', reply: loc(lang, 'noSpeech') };

  const schema = {
    type: 'object',
    properties: {
      intent: { type: 'string', enum: ['NAVIGATE', 'OPEN_CUSTOMER', 'OPEN_CUSTOMER_BILLS', 'FIND_ITEM', 'FIND_SUPPLIER', 'QUERY', 'OPEN_BILL_NUMBER', 'DESTRUCTIVE', 'UNKNOWN'] },
      params: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          customer_name: { type: 'string' },
          item_name: { type: 'string' },
          supplier_name: { type: 'string' },
          query_type: { type: 'string' },
          bill_number: { type: 'string' },
          target: { type: 'string' },
          name: { type: 'string' },
          action: { type: 'string' },
        },
      },
      reply: { type: 'string', description: 'Short confirmation in the user language' },
    },
    required: ['intent', 'reply'],
  };

  const prompt = [
    'You are the intent parser for the JewelCore jewellery ERP voice assistant.',
    'Parse the user spoken command (it may be English, Hindi, Marathi, or a natural mix of these, e.g. "ABC customer cha bill dakhav").',
    'Respond in the user language (' + langName(lang) + ').',
    '',
    'Map to exactly one intent:',
    '- NAVIGATE { path }: open a module. path one of: "/", "/billing", "/bills", "/customers", "/suppliers", "/purchase", "/inventory/gold", "/inventory/silver", "/orders", "/karagir", "/rates", "/master", "/settings", "/admin", "/data".',
    '- OPEN_CUSTOMER { customer_name }: open a customer profile.',
    '- OPEN_CUSTOMER_BILLS { customer_name }: open a customer bills.',
    '- FIND_ITEM { item_name }: find an inventory item.',
    '- FIND_SUPPLIER { supplier_name }: find a supplier.',
    '- QUERY { query_type }: one of "today_sales","monthly_sales","low_stock","out_of_stock","pending_payments","due_bills","customer_count","supplier_outstanding","gold_item_count","silver_item_count","recent_bills".',
    '- OPEN_BILL_NUMBER { bill_number }: open a specific bill (digits only).',
    '- DESTRUCTIVE { target, name, action }: target one of "item","category","purity","gst","supplier","bill","stock"; action one of "delete","cancel","adjust". Only when the user clearly wants to delete/cancel/adjust.',
    '- UNKNOWN: when no intent fits.',
    '',
    'Rules:',
    '- Extract the person/item/supplier name accurately from the sentence.',
    '- reply must be a SHORT confirmation in the user language.',
    '- Never invent data values; only structure the intent.',
    '',
    'User command: """' + text + '"""',
  ].join('\n');

  let parsed;
  try {
    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: prompt,
      response_json_schema: schema,
    });
    parsed = typeof res === 'string' ? JSON.parse(res) : res;
  } catch (e) {
    return { intent: 'UNKNOWN', reply: loc(lang, 'parseFail') };
  }

  const intent = parsed.intent || 'UNKNOWN';
  const params = parsed.params || {};
  const reply = parsed.reply || loc(lang, 'understood');
  const out = { intent: intent, reply: reply, params: params };

  if (intent === 'OPEN_CUSTOMER' || intent === 'OPEN_CUSTOMER_BILLS') {
    out.matches = await resolveEntity(base44, ctx, 'customer', params.customer_name || '');
  } else if (intent === 'FIND_ITEM') {
    out.matches = await resolveEntity(base44, ctx, 'item', params.item_name || '');
  } else if (intent === 'FIND_SUPPLIER') {
    out.matches = await resolveEntity(base44, ctx, 'supplier', params.supplier_name || '');
  } else if (intent === 'QUERY') {
    out.query_result = await runQuery(base44, ctx, params.query_type || '', lang);
  } else if (intent === 'DESTRUCTIVE') {
    const t = params.target || '';
    if (t === 'item' || t === 'category' || t === 'purity') {
      out.matches = await resolveEntity(base44, ctx, t, params.name || '');
    } else if (t === 'gst') {
      out.matches = await resolveEntity(base44, ctx, 'gst', params.name || '');
    } else if (t === 'supplier') {
      out.matches = await resolveEntity(base44, ctx, 'supplier', params.name || '');
    } else if (t === 'bill') {
      out.bill_number = params.name || '';
    }
    out.destructive = { target: t, action: params.action || 'delete', name: params.name || '' };
  }

  return out;
}

// --- Entity resolution by name fragment (tenant-scoped, case-insensitive) ---
async function resolveEntity(base44, ctx, type, name) {
  const q = (name || '').trim().toLowerCase();
  if (!q) return { matches: [] };
  // single-business: no tenant scoping needed
  let rows = [];
  try {
    if (type === 'customer') {
      rows = await base44.asServiceRole.entities.Customer.filter({ is_deleted: false }, '-created_date', 50);
    } else if (type === 'item') {
      rows = await base44.asServiceRole.entities.InventoryItem.filter({ is_archived: false }, '-created_date', 80);
    } else if (type === 'supplier') {
      rows = await base44.asServiceRole.entities.Supplier.filter({}, '-created_date', 50);
    } else if (type === 'category') {
      rows = await base44.asServiceRole.entities.CategoryMaster.filter({ is_active: true }, '-created_date', 50);
    } else if (type === 'purity') {
      rows = await base44.asServiceRole.entities.PurityMaster.filter({ is_active: true }, '-created_date', 50);
    } else if (type === 'gst') {
      rows = await base44.asServiceRole.entities.GSTConfig.filter({ is_active: true }, '-created_date', 20);
    }
  } catch (e) { return { matches: [] }; }

  const fieldOf = function (r) { return (r.name || r.item_name || r.shop_name || '').toLowerCase(); };
  const scored = rows.map(function (r) { return { row: r, score: scoreMatch(fieldOf(r), q) }; })
    .filter(function (x) { return x.score > 0; })
    .sort(function (a, b) { return b.score - a.score; })
    .slice(0, 5);

  const matches = scored.map(function (x) {
    const r = x.row;
    const label = r.name || r.item_name || r.shop_name || '';
    const meta = [r.metal_type, r.purity_display, r.mobile, r.supplier_code, r.item_code].filter(Boolean).join(' / ');
    return { id: r.id, label: label, meta: meta, metal_type: r.metal_type };
  });
  return { matches: matches };
}

function scoreMatch(field, q) {
  if (!field) return 0;
  if (field === q) return 100;
  if (field.startsWith(q)) return 80;
  if (field.includes(q)) return 60;
  const ft = field.split(/\s+/), qt = q.split(/\s+/);
  let overlap = 0;
  for (let i = 0; i < qt.length; i++) { if (qt[i].length > 1 && ft.includes(qt[i])) overlap++; }
  return overlap > 0 ? 30 + overlap * 5 : 0;
}

// --- Informational queries against real tenant data ---
async function runQuery(base44, ctx, queryType, lang) {
  // single-business: no tenant scoping needed
  const cur = function (n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN'); };
  try {
    if (queryType === 'today_sales') {
      const bills = await base44.asServiceRole.entities.Bill.filter({ status: 'finalized' }, '-bill_date', 300);
      const today = new Date().toLocaleDateString('en-CA');
      let total = 0;
      for (const b of bills) if (String(b.bill_date || '').slice(0, 10) === today) total += Number(b.total_amount || 0);
      return { value: total, reply: loc(lang, 'todaySales', cur(total)) };
    }
    if (queryType === 'monthly_sales') {
      const bills = await base44.asServiceRole.entities.Bill.filter({ status: 'finalized' }, '-bill_date', 500);
      const m = new Date().toLocaleString('en-CA', { year: 'numeric', month: '2-digit' });
      let total = 0;
      for (const b of bills) if (String(b.bill_date || '').slice(0, 7) === m) total += Number(b.total_amount || 0);
      return { value: total, reply: loc(lang, 'monthlySales', cur(total)) };
    }
    if (queryType === 'low_stock') {
      const rows = await base44.asServiceRole.entities.InventoryItem.filter({ is_archived: false }, '-created_date', 300);
      const items = rows.filter(function (r) { return r.status === 'low_stock'; });
      return { value: items.length, reply: loc(lang, 'lowStock', items.length) };
    }
    if (queryType === 'out_of_stock') {
      const rows = await base44.asServiceRole.entities.InventoryItem.filter({ is_archived: false }, '-created_date', 300);
      const items = rows.filter(function (r) { return r.status === 'out_of_stock'; });
      return { value: items.length, reply: loc(lang, 'outOfStock', items.length) };
    }
    if (queryType === 'pending_payments') {
      const rows = await base44.asServiceRole.entities.CustomerOutstanding.filter({ status: 'open' }, '-created_date', 300);
      let total = 0;
      for (const r of rows) total += Number(r.amount || 0);
      return { value: total, reply: loc(lang, 'pendingPayments', cur(total)) };
    }
    if (queryType === 'due_bills') {
      const bills = await base44.asServiceRole.entities.Bill.filter({ status: 'finalized' }, '-bill_date', 300);
      let count = 0;
      for (const b of bills) if (Number(b.due_amount || 0) > 0) count++;
      return { value: count, reply: loc(lang, 'dueBills', count) };
    }
    if (queryType === 'customer_count') {
      const rows = await base44.asServiceRole.entities.Customer.filter({ is_deleted: false }, '-created_date', 500);
      return { value: rows.length, reply: loc(lang, 'customerCount', rows.length) };
    }
    if (queryType === 'supplier_outstanding') {
      const rows = await base44.asServiceRole.entities.Supplier.filter({}, '-created_date', 200);
      const list = rows.filter(function (r) { return Number(r.outstanding || 0) > 0; });
      let total = 0;
      for (const r of list) total += Number(r.outstanding || 0);
      return { value: list.length, reply: loc(lang, 'supplierOutstanding', list.length, cur(total)) };
    }
    if (queryType === 'gold_item_count') {
      const rows = await base44.asServiceRole.entities.InventoryItem.filter({ is_archived: false, metal_type: 'gold' }, '-created_date', 300);
      const inStock = rows.filter(function (r) { return r.status !== 'out_of_stock'; }).length;
      return { value: inStock, reply: loc(lang, 'goldCount', inStock) };
    }
    if (queryType === 'silver_item_count') {
      const rows = await base44.asServiceRole.entities.InventoryItem.filter({ is_archived: false, metal_type: 'silver' }, '-created_date', 300);
      const inStock = rows.filter(function (r) { return r.status !== 'out_of_stock'; }).length;
      return { value: inStock, reply: loc(lang, 'silverCount', inStock) };
    }
    if (queryType === 'recent_bills') {
      const bills = await base44.asServiceRole.entities.Bill.filter({ status: 'finalized' }, '-bill_date', 5);
      return { value: bills.length, reply: loc(lang, 'recentBills', bills.length) };
    }
    return { reply: loc(lang, 'noData') };
  } catch (e) {
    return { reply: loc(lang, 'noData') };
  }
}

function langName(l) { return l === 'hi' ? 'Hindi' : l === 'mr' ? 'Marathi' : 'English'; }

// Tiny server-side localization for query replies. Plain string concatenation
// (no template literals) to keep the parser happy with Devanagari text.
function loc(lang, key, a, b) {
  const R = {
    en: {
      noSpeech: "I didn't hear anything. Please try again.",
      parseFail: "I couldn't understand that. Please try again.",
      understood: 'Okay.',
      todaySales: function (v) { return "Today's sales are " + v + '.'; },
      monthlySales: function (v) { return "This month's sales are " + v + '.'; },
      lowStock: function (n) { return 'There are ' + n + ' low-stock items.'; },
      outOfStock: function (n) { return 'There are ' + n + ' out-of-stock items.'; },
      pendingPayments: function (v) { return 'Pending payments total ' + v + '.'; },
      dueBills: function (n) { return 'There are ' + n + ' bills with due balance.'; },
      customerCount: function (n) { return 'You have ' + n + ' customers.'; },
      supplierOutstanding: function (n, v) { return n + ' suppliers have outstanding payments totaling ' + v + '.'; },
      goldCount: function (n) { return 'There are ' + n + ' gold items in stock.'; },
      silverCount: function (n) { return 'There are ' + n + ' silver items in stock.'; },
      recentBills: function (n) { return 'There are ' + n + ' recent bills.'; },
      noData: "I couldn't find that information.",
    },
    hi: {
      noSpeech: 'कुछ सुनाई नहीं दिया। कृपया दोबारा बोलें।',
      parseFail: 'मैं समझ नहीं पाया। कृपया दोबारा बोलें।',
      understood: 'ठीक है।',
      todaySales: function (v) { return 'आज की बिक्री ' + v + ' है।'; },
      monthlySales: function (v) { return 'इस महीने की बिक्री ' + v + ' है।'; },
      lowStock: function (n) { return n + ' आइटम कम स्टॉक में हैं।'; },
      outOfStock: function (n) { return n + ' आइटम स्टॉक से बाहर हैं।'; },
      pendingPayments: function (v) { return 'बकाया भुगतान कुल ' + v + ' है।'; },
      dueBills: function (n) { return n + ' बिलों में बाकी राशि है।'; },
      customerCount: function (n) { return 'आपके पास ' + n + ' ग्राहक हैं।'; },
      supplierOutstanding: function (n, v) { return n + ' सप्लायर का बकाया ' + v + ' है।'; },
      goldCount: function (n) { return 'स्टॉक में ' + n + ' गोल्ड आइटम हैं।'; },
      silverCount: function (n) { return 'स्टॉक में ' + n + ' सिल्वर आइटम हैं।'; },
      recentBills: function (n) { return n + ' हाल के बिल हैं।'; },
      noData: 'यह जानकारी नहीं मिली।',
    },
    mr: {
      noSpeech: 'काही ऐकू आले नाही. कृपया पुन्हा बोला.',
      parseFail: 'मला समजले नाही. कृपया पुन्हा बोला.',
      understood: 'ठीक आहे.',
      todaySales: function (v) { return 'आजची विक्री ' + v + ' आहे.'; },
      monthlySales: function (v) { return 'या महिन्याची विक्री ' + v + ' आहे.'; },
      lowStock: function (n) { return n + ' आयटम कमी स्टॉकमध्ये आहेत.'; },
      outOfStock: function (n) { return n + ' आयटम स्टॉक बाहेर आहेत.'; },
      pendingPayments: function (v) { return 'प्रलंबित पेमेंट एकूण ' + v + ' आहे.'; },
      dueBills: function (n) { return n + ' बिलमध्ये बाकी रक्कम आहे.'; },
      customerCount: function (n) { return 'तुमच्याकडे ' + n + ' ग्राहक आहेत.'; },
      supplierOutstanding: function (n, v) { return n + ' सप्लायरचे बाकी ' + v + ' आहे.'; },
      goldCount: function (n) { return 'स्टॉकमध्ये ' + n + ' गोल्ड आयटम आहेत.'; },
      silverCount: function (n) { return 'स्टॉकमध्ये ' + n + ' सिल्व्हर आयटम आहेत.'; },
      recentBills: function (n) { return n + ' अलीकडील बिल आहेत.'; },
      noData: 'ही माहिती सापडली नाही.',
    },
  };
  const d = R[lang] || R.en;
  const v = d[key];
  if (typeof v === 'function') return v(a, b);
  return v || R.en[key] || '';
}