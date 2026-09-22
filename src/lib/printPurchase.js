// Purchase printer — opens a dedicated print window with ONLY the supplier
// purchase copy. Uses the purchaseTemplate (distinct from the customer invoice).
import { buildPurchaseDocument } from "@/lib/purchaseTemplate";

export async function printPurchase(purchase, items, settings) {
  const w = window.open("", "_blank", "width=820,height=650");
  if (!w) { alert("Please allow popups to print the purchase bill"); return; }
  if (!items || items.length === 0) { w.close(); alert("No items to print"); return; }
  const html = buildPurchaseDocument({ purchase, items, shop: settings });
  w.document.open();
  w.document.write(html);
  w.document.close();
}