// Human-readable column definitions for data export.
// Each module maps raw entity fields to clean column names with optional formatters.
// Only mapped fields appear in CSV/Excel/PDF — raw JSON, IDs, rate_snapshot,
// payment_components, and other technical fields are excluded.

const inventoryColumns = [
  { key: "item_name", label: "Item Name" },
  { key: "huid", label: "HUID" },
  { key: "item_code", label: "Item Code" },
  { key: "metal_type", label: "Metal", format: (v) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : "") },
  { key: "category_name", label: "Category" },
  { key: "gross_weight", label: "Gross Wt (g)", format: (v) => Number(v || 0).toFixed(3), align: "right" },
  { key: "stone_weight", label: "Less Wt (g)", format: (v) => Number(v || 0).toFixed(3), align: "right" },
  { key: "net_weight", label: "Net Wt (g)", format: (v) => Number(v || 0).toFixed(3), align: "right" },
  { key: "purity_display", label: "Purity" },
  { key: "fine_weight", label: "Fine Wt (g)", format: (v) => Number(v || 0).toFixed(3), align: "right" },
  { key: "quantity", label: "Stock", align: "right" },
  { key: "status", label: "Status" },
];

export const COLUMN_MAP = {
  Bill: {
    label: "Bills",
    columns: [
      { key: "bill_number", label: "Bill No." },
      { key: "customer_name", label: "Customer" },
      { key: "customer_mobile", label: "Mobile" },
      { key: "bill_date", label: "Bill Date", format: (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "") },
      { key: "bill_source", label: "Bill Type", format: (v) => ({ inventory: "Inventory", manual: "Manual", customer_purchase: "Customer Purchase" }[v] || v || "") },
      { key: "total_amount", label: "Total (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
      { key: "paid_amount", label: "Paid (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
      { key: "due_amount", label: "Due (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
      { key: "status", label: "Status" },
    ],
  },
  Customer: {
    label: "Customers",
    columns: [
      { key: "name", label: "Customer Name" },
      { key: "mobile", label: "Mobile" },
      { key: "gst_number", label: "GST Number" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "outstanding", label: "Outstanding (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
    ],
  },
  GoldInventory: { label: "Gold Inventory", columns: inventoryColumns },
  SilverInventory: { label: "Silver Inventory", columns: inventoryColumns },
  Purchase: {
    label: "Purchases",
    columns: [
      { key: "purchase_number", label: "Purchase No." },
      { key: "supplier_name", label: "Supplier" },
      { key: "purchase_date", label: "Purchase Date", format: (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "") },
      { key: "total_amount", label: "Total (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
      { key: "paid_amount", label: "Paid (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
      { key: "due_amount", label: "Due (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
      { key: "status", label: "Status" },
    ],
  },
  Supplier: {
    label: "Suppliers",
    columns: [
      { key: "name", label: "Supplier Name" },
      { key: "mobile", label: "Mobile" },
      { key: "gst_number", label: "GST Number" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "outstanding", label: "Outstanding (₹)", format: (v) => Number(v || 0).toFixed(2), align: "right" },
    ],
  },
  CustomerOrder: {
    label: "Customer Orders",
    columns: [
      { key: "order_number", label: "Order No." },
      { key: "customer_name", label: "Customer" },
      { key: "required_item", label: "Required Item" },
      { key: "order_date", label: "Order Date", format: (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "") },
      { key: "expected_completion_date", label: "Expected Completion", format: (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "") },
      { key: "status", label: "Status" },
    ],
  },
  Karagir: {
    label: "Karagirs",
    columns: [
      { key: "name", label: "Name" },
      { key: "mobile", label: "Mobile" },
      { key: "specialization", label: "Specialization" },
      { key: "status", label: "Status" },
    ],
  },
};

// Convert raw records to human-readable rows using the column mapping.
// Returns { headers, rows, columns } — only mapped fields, no raw JSON/IDs.
export function mapRecords(moduleId, records) {
  const config = COLUMN_MAP[moduleId];
  if (!config) return { headers: [], rows: [], columns: [] };
  const headers = config.columns.map((c) => c.label);
  const rows = records.map((r) =>
    config.columns.map((c) => {
      const val = c.format ? c.format(r[c.key]) : (r[c.key] ?? "");
      return String(val ?? "");
    })
  );
  return { headers, rows, columns: config.columns };
}