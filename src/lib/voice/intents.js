// Deterministic intent matcher for the Voice Assistant.
// Handles obvious navigation + informational-query commands instantly, with
// NO backend/LLM call (cost + latency friendly). Anything ambiguous, mixed, or
// entity-based is left to the backend `understand` action (InvokeLLM).
//
// Keywords cover English, Hindi (Devanagari + romanized) and Marathi.

// Navigation destinations, ordered most-specific first so e.g. "gold inventory"
// matches before a generic "inventory" and "bill history" before "billing".
const NAV_RULES = [
  { path: "/billing", module: "billing", keys: ["new bill", "open billing", "open new bill", "billing", "create bill", "नया बिल", "नवीन बिल", "बिल बनाओ", "बिल तयार करा", "new bill kholo", "नवीन बिल उघड"] },
  { path: "/bills", module: "bills", keys: ["bill history", "bills", "बिल हिस्ट्री", "बिल हिस्टरी", "show bills", "बिल दिखाओ", "बिल दाखव", "today bills", "today bill", "completed bill", "partial bill", "due bill", "latest bill", "बाकी वाले बिल", "बाकी असलेले बिल", "all bills", "invoice history"] },
  { path: "/inventory/gold", module: "inventory", keys: ["gold inventory", "gold stock", "गोल्ड इन्वेंटरी", "गोल्ड इन्व्हेंटरी", "सोने का स्टॉक", "सोन्याचा स्टॉक", "gold items"] },
  { path: "/inventory/silver", module: "inventory", keys: ["silver inventory", "silver stock", "सिल्वर इन्वेंटरी", "सिल्व्हर इन्व्हेंटरी", "चांदी का स्टॉक", "चांदीचा स्टॉक", "silver items"] },
  { path: "/customers", module: "customers", keys: ["customer section", "customers", "ग्राहक", "open customer", "all customers", "ग्राहक विभाग"] },
  { path: "/suppliers", module: "suppliers", keys: ["suppliers", "supplier", "सप्लायर", "सप्लायर दाखव", "all suppliers"] },
  { path: "/purchase", module: "purchase", keys: ["purchase", "purchases", "पर्चेस", "खरेदी", "recent purchases", "purchase history", "खरेदी दाखव"] },
  { path: "/orders", module: "orders", keys: ["customer orders", "orders", "ऑर्डर", "ऑर्डर दाखव", "all orders"] },
  { path: "/karagir", module: "karagir", keys: ["karagir", "कारागीर", "कारागिर", "all karagir"] },
  { path: "/rates", module: "rates", keys: ["rate management", "rates", "gold rate", "silver rate", "रेट", "भाव", "सोन्याचा भाव", "चांदीचा भाव"] },
  { path: "/master", module: "master", keys: ["master configuration", "master config", "purity management", "category management", "item management", "gst management", "master", "मास्टर", "मास्टर कॉन्फिग", "मास्टर कॉन्फिगरेशन"] },
  { path: "/settings", module: "settings", keys: ["settings", "सेटिंग्स", "shop settings"] },
  { path: "/admin", module: "admin", keys: ["admin control", "admin", "एडमिन", "अडमिन"] },
  { path: "/data", module: "data", keys: ["data management", "data", "डेटा", "डेटा मॅनेजमेंट"] },
  { path: "/", module: "dashboard", keys: ["dashboard", "डैशबोर्ड", "डॅशबोर्ड", "मुख्य पृष्ठ", "मुख्यपृष्ठ", "मुखपृष्ठ", "home"] },
];

// Informational query keywords → query_type sent to backend `query` action.
const QUERY_RULES = [
  { type: "today_sales", keys: ["today sales", "today's sales", "आज की बिक्री", "आजची विक्री", "today sale"] },
  { type: "monthly_sales", keys: ["monthly sales", "month sales", "इस महीने की बिक्री", "या महिन्याची विक्री", "this month sales"] },
  { type: "low_stock", keys: ["low stock", "कम स्टॉक", "कमी स्टॉक", "कम स्टॉक वाले", "कमी स्टॉकचे"] },
  { type: "out_of_stock", keys: ["out of stock", "out-of-stock", "स्टॉक से बाहर", "स्टॉक बाहेर"] },
  { type: "pending_payments", keys: ["pending payment", "pending payments", "बकाया भुगतान", "प्रलंबित पेमेंट", "how much payment is pending", "payment pending"] },
  { type: "due_bills", keys: ["how many bills are due", "due bills", "बाकी बिल", "due bill count", "bills due"] },
  { type: "customer_count", keys: ["how many customers", "total customers", "customer count", "कितने ग्राहक", "कितने ग्राहक आहेत", "ग्राहकों की संख्या"] },
  { type: "supplier_outstanding", keys: ["supplier outstanding", "supplier pending", "सप्लायर बकाया", "which supplier has outstanding"] },
  { type: "gold_item_count", keys: ["how many gold items", "gold item count", "gold items in stock", "कितने गोल्ड आइटम", "गोल्ड आयटम"] },
  { type: "silver_item_count", keys: ["how many silver items", "silver item count", "silver items in stock", "कितने सिल्वर आइटम", "सिल्व्हर आयटम"] },
  { type: "recent_bills", keys: ["recent bills", "latest bills", "हाल के बिल", "अलीकडील बिल"] },
];

// Entity/possessive markers — when present, the command likely references a
// specific customer/item/supplier/bill, so skip deterministic navigation and
// let the backend LLM resolve the entity (e.g. "show ABC's bills", "ABC का बिल दिखाओ",
// "ABC customer cha bill dakhav", "find item ABC").
const ENTITY_MARKERS = [
  "'s ", " of ", " for ", "find ", "search ", "look up", "named ",
  " का ", " की ", " के ", " चा ", " ची ", " चे ",
  " ka ", " ki ", " ke ", " cha ", " chi ", " che ",
  "खोज", "शोध", "शोधा",
];

// Destructive-action keywords. If matched, the command is NOT executed here —
// it is forwarded to the backend `understand` action which returns a confirmation
// request. This detector just lets us short-circuit obvious destructive phrasing
// straight to confirmation without an LLM call.
const DESTRUCTIVE_KEYS = [
  "delete", "remove", "cancel", "adjust stock", "modify stock", "change stock",
  "रद्द", "हटाओ", "हटव", "डिलीट", "स्टॉक बदल",
];

function normalize(text) {
  return String(text || "").toLowerCase().trim().replace(/[.,!?;:]+$/g, "").trim();
}

function hasAny(text, keys) {
  return keys.some((k) => text.includes(k));
}

// Returns a deterministic intent or null (→ caller falls back to backend LLM).
export function matchIntent(rawText) {
  const text = normalize(rawText);
  if (!text) return null;

  // Destructive phrasing → delegate to backend for confirmation flow.
  if (hasAny(text, DESTRUCTIVE_KEYS)) {
    return { kind: "destructive", raw: rawText };
  }

  // Informational queries (checked before navigation since some overlap, e.g. "low stock").
  for (const rule of QUERY_RULES) {
    if (hasAny(text, rule.keys)) return { kind: "query", queryType: rule.type };
  }

  // Entity/possessive commands → defer to backend LLM for resolution.
  if (hasAny(text, ENTITY_MARKERS)) return { kind: "llm" };

  // Navigation.
  for (const rule of NAV_RULES) {
    if (hasAny(text, rule.keys)) return { kind: "navigate", path: rule.path, module: rule.module };
  }

  return null;
}