import React from "react";
import { fmt } from "@/lib/billCalc";
import { Badge, TableShell, EmptyState } from "@/components/ui/erp";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, Percent } from "lucide-react";

export default function RateHistoryDialog({ open, onClose, history = [] }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <History className="w-5 h-5 text-amber-600" />
            <span>Rate History Archive</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Complete historical audit trail of daily benchmark rate updates and active periods.
          </p>
        </DialogHeader>

        {history.length === 0 ? (
          <EmptyState icon={Percent} title="No rate history" description="Rates will appear here after updates." />
        ) : (
          <div className="py-2">
            <TableShell headers={["Metal", "Purity", "Rate / gram", "Source", "Effective Date", "Status"]}>
              {history.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors text-xs">
                  <td className="px-4 py-3 capitalize font-semibold text-foreground">{r.metal_type}</td>
                  <td className="px-4 py-3 text-foreground font-mono">{r.purity_display || "—"}</td>
                  <td className="px-4 py-3 font-bold font-mono text-foreground text-sm">{fmt(r.rate_per_gram)}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.source || "manual"}
                    {r.is_manual_override ? " (override)" : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(r.effective_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={r.is_active ? "success" : "default"} dot={true}>
                      {r.is_active ? "Active" : "Archived"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
