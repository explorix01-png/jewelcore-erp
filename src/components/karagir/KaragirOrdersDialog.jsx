import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hammer } from "lucide-react";

// Shows Customer Orders assigned to a specific Karagir.
// Helps Admin see which karagir is working on which customer's order
// without physically visiting the workshop.
export default function KaragirOrdersDialog({ karagir, onClose }) {
  const t = useT();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!karagir) return;
    setLoading(true);
    base44.entities.CustomerOrder.filter({ karagir_id: karagir.id }, "-order_date", 200)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [karagir]);

  if (!karagir) return null;

  return (
    <Dialog open={!!karagir} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hammer className="w-4 h-4" /> {karagir.name} — {t("karagir.viewOrders")}
          </DialogTitle>
        </DialogHeader>
        {loading ? <Spinner /> : orders.length === 0 ? (
          <EmptyState icon={Hammer} title={t("karagir.noOrdersAssigned")} description={t("karagir.noOrdersAssignedDesc")} />
        ) : (
          <TableShell headers={["Order No.", "Customer", "Item", "Expected", "Status"]}>
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 font-mono text-xs">{o.order_number}</td>
                <td className="px-4 py-3 font-medium">{o.customer_name || "—"}</td>
                <td className="px-4 py-3">{o.required_item}</td>
                <td className="px-4 py-3 text-xs">{o.expected_completion_date || "—"}</td>
                <td className="px-4 py-3"><Badge variant={o.status === "DELIVERED" ? "success" : o.status === "CANCELLED" ? "danger" : o.status === "READY" ? "info" : "warning"}>{t("status." + o.status)}</Badge></td>
              </tr>
            ))}
          </TableShell>
        )}
      </DialogContent>
    </Dialog>
  );
}