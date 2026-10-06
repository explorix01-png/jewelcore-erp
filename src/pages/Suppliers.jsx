import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, Badge, TableShell, StatCard } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function Suppliers() {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Supplier.list("-created_date", 200);
      setSuppliers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load suppliers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const total = suppliers.length;
    const active = suppliers.filter((s) => s.status !== "inactive").length;
    const totalDue = suppliers.reduce((sum, s) => sum + (Number(s.outstanding) > 0 ? Number(s.outstanding) : 0), 0);
    return { total, active, totalDue };
  }, [suppliers]);

  const filtered = useMemo(() => suppliers.filter((s) => {
    const x = debouncedQ.toLowerCase();
    return !x || s.name?.toLowerCase().includes(x) || s.mobile?.includes(x) || s.gst_number?.toLowerCase().includes(x);
  }), [suppliers, debouncedQ]);

  const pag = usePagination(filtered, 15);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected supplier(s)? Suppliers with purchases or transactions will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageSupplier", { action: "bulk_delete", ids: bulk.selectedArray });
      if (!res.data?.success) { alert(res.data?.error || "Bulk delete failed"); return; }
      setBulkResult(res.data);
      bulk.clear();
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const save = async (data) => {
    try {
      if (editing) {
        const res = await base44.functions.invoke("manageSupplier", { action: "update", id: editing.id, data });
        if (!res.data?.success) { alert(res.data?.error || "Update failed"); return; }
      } else {
        const res = await base44.functions.invoke("manageSupplier", { action: "create", data });
        if (!res.data?.success) { alert(res.data?.error || "Create failed"); return; }
      }
      setOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const deletePermanent = async (s) => {
    if (!confirm(`Permanently delete supplier "${s.name}"? This cannot be undone.`)) return;
    try {
      const res = await base44.functions.invoke("manageSupplier", { action: "delete_permanent", id: s.id });
      if (!res.data?.success) { alert(res.data?.error || "Delete failed"); return; }
      alert("Supplier deleted permanently.");
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <Truck className="w-3.5 h-3.5 text-amber-600" />
            <span>Procurement Vendors</span>
          </span>
        }
        title={t("suppliers.title")}
        subtitle="Manage bullion dealers, bullion suppliers, gemstone distributors, and wholesale balances."
        actions={
          <Button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t("suppliers.newSupplier")}
          </Button>
        }
      />

      {/* Supplier KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Suppliers"
          value={stats.total}
          sub={`${stats.active} active accounts`}
          icon={Truck}
          accent="bg-blue-50 text-blue-700 border border-blue-200/60"
        />
        <StatCard
          label="Active Vendors"
          value={stats.active}
          sub="Verified trade partners"
          icon={Truck}
          accent="bg-emerald-50 text-emerald-700 border border-emerald-200/60"
        />
        <StatCard
          label="Payable Outstandings"
          value={fmt(stats.totalDue)}
          sub={stats.totalDue > 0 ? "Pending payment to vendors" : "All vendor accounts clear"}
          icon={Truck}
          accent={stats.totalDue > 0 ? "bg-amber-50 text-amber-700 border border-amber-200/60" : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"}
        />
      </div>

      {/* Search Toolbar */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); pag.setPage(1); }}
            placeholder={t("suppliers.searchPlaceholder")}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      {loading ? (
        <Spinner label="Loading vendor directory..." />
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border/90 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <Truck className="w-8 h-8" />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {suppliers.length === 0 ? t("suppliers.noSuppliers") : "No matching suppliers found"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
            {suppliers.length === 0
              ? "Register wholesale jewellery vendors, bullion dealers, and casting suppliers to record stock purchases."
              : "Try adjusting your search terms to locate specific supplier accounts."}
          </p>
          {suppliers.length === 0 && (
            <div className="mt-6 flex justify-center">
              <Button
                onClick={() => { setEditing(null); setOpen(true); }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                <span>Register First Supplier</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <BulkActionBar
            selectedCount={bulk.selectedCount}
            onDelete={handleBulkDelete}
            onClear={bulk.clear}
            deleting={deleting}
          />

          <TableShell
            headers={[
              <Checkbox
                checked={bulk.isAllSelected ? true : bulk.isIndeterminate ? "indeterminate" : false}
                onCheckedChange={bulk.toggleAll}
              />,
              "Supplier Name",
              "Code",
              "Mobile Contact",
              "GST Number",
              "Payable Balance",
              "Status",
              t("common.actions")
            ]}
          >
            {pag.pageItems.map((s) => {
              const initials = s.name ? s.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "S";
              const outstandingAmt = Number(s.outstanding || 0);

              return (
                <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3.5">
                    <Checkbox
                      checked={bulk.isSelected(s.id)}
                      onCheckedChange={() => bulk.toggleOne(s.id)}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{s.name}</p>
                        {s.email && <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground font-medium">
                    {s.supplier_code ? (
                      <span className="px-2 py-0.5 rounded bg-muted border border-border">
                        {s.supplier_code}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-foreground font-mono font-medium">
                    {s.mobile || "—"}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground font-mono">
                    {s.gst_number || "—"}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {outstandingAmt > 0 ? (
                      <Badge variant="warning" dot={true} className="font-mono font-semibold">
                        {fmt(outstandingAmt)} Due
                      </Badge>
                    ) : (
                      <Badge variant="success" dot={true}>
                        Clear
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Badge variant={s.status === "active" ? "success" : "default"} dot={true}>
                      {s.status || "active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setEditing(s); setOpen(true); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit Supplier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deletePermanent(s)}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-600 transition-colors"
                        title="Delete Permanently"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </TableShell>

          <Pagination {...pag} />
        </div>
      )}

      {bulkResult && <BulkDeleteResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Truck className="w-4 h-4" />
              </div>
              {editing ? t("suppliers.editSupplier") : t("suppliers.newSupplier")}
            </DialogTitle>
          </DialogHeader>
          <SupplierForm initial={editing} onSave={save} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplierForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({
    name: initial?.name || "",
    mobile: initial?.mobile || "",
    email: initial?.email || "",
    address: initial?.address || "",
    gst_number: initial?.gst_number || "",
    notes: initial?.notes || "",
    status: initial?.status || "active",
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <Label className="text-xs font-semibold text-foreground">
            Supplier / Company Name <span className="text-red-500">*</span>
          </Label>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="e.g. Zaveri Bullion Ltd."
            className="mt-1"
            autoFocus
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">Mobile Contact</Label>
          <Input
            value={f.mobile}
            onChange={(e) => setF({ ...f, mobile: e.target.value })}
            placeholder="e.g. 9876543210"
            className="mt-1 font-mono text-sm"
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">Email</Label>
          <Input
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            placeholder="dealer@bullion.com"
            className="mt-1 text-sm"
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">GST Number</Label>
          <Input
            value={f.gst_number}
            onChange={(e) => setF({ ...f, gst_number: e.target.value })}
            placeholder="27AAAAA0000A1Z5"
            className="mt-1 font-mono text-sm uppercase"
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">Status</Label>
          <select
            value={f.status}
            onChange={(e) => setF({ ...f, status: e.target.value })}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-input bg-background"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <Label className="text-xs font-semibold text-foreground">Office Address</Label>
          <Textarea
            value={f.address}
            onChange={(e) => setF({ ...f, address: e.target.value })}
            rows={2}
            placeholder="Bullion market address..."
            className="mt-1 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <Label className="text-xs font-semibold text-foreground">Notes</Label>
          <Input
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="Credit terms, bank details, delivery terms..."
            className="mt-1 text-sm"
          />
        </div>
      </div>

      <DialogFooter className="pt-3 border-t border-border">
        <Button variant="outline" onClick={onCancel} type="button">
          Cancel
        </Button>
        <Button
          onClick={() => f.name && onSave(f)}
          disabled={!f.name?.trim()}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
        >
          Save Supplier
        </Button>
      </DialogFooter>
    </div>
  );
}