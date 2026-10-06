import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { PageHeader, Badge, TableShell, StatCard } from "@/components/ui/erp";
import { fmt } from "@/lib/billCalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Users, Plus, Search, Pencil, Trash2, Receipt, History, AlertCircle,
  IndianRupee, UserPlus, Phone
} from "lucide-react";
import { usePagination } from "@/hooks/usePagination";
import { Pagination } from "@/components/ui/pagination";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { BulkActionBar, BulkDeleteResultDialog } from "@/components/ui/BulkActionBar";
import { Checkbox } from "@/components/ui/checkbox";
import { useDebounced } from "@/hooks/useDebounced";

export default function Customers() {
  const t = useT();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [statusFilter, setStatusFilter] = useState("all"); // 'all' | 'due' | 'clear'
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await base44.entities.Customer.list("-created_date", 500);
      setCustomers(all.filter((c) => !c.is_deleted));
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Real-time calculated KPI metrics from actual customer dataset
  const stats = useMemo(() => {
    const total = customers.length;
    const withDue = customers.filter((c) => Number(c.outstanding || 0) > 0);
    const totalDue = withDue.reduce((sum, c) => sum + Number(c.outstanding || 0), 0);
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recent = customers.filter((c) => c.created_date && new Date(c.created_date).getTime() >= thirtyDaysAgo).length;

    return {
      total,
      withDueCount: withDue.length,
      totalDue,
      clearCount: total - withDue.length,
      recentCount: recent,
    };
  }, [customers]);

  // Combined search & status filtering
  const filtered = useMemo(() => {
    return customers.filter((c) => {
      // Status filter
      if (statusFilter === "due" && Number(c.outstanding || 0) <= 0) return false;
      if (statusFilter === "clear" && Number(c.outstanding || 0) > 0) return false;

      // Text search
      const s = debouncedQ.toLowerCase().trim();
      if (!s) return true;
      return (
        c.name?.toLowerCase().includes(s) ||
        c.mobile?.includes(s) ||
        c.customer_code?.toLowerCase().includes(s) ||
        c.gst_number?.toLowerCase().includes(s) ||
        c.notes?.toLowerCase().includes(s)
      );
    });
  }, [customers, debouncedQ, statusFilter]);

  const pag = usePagination(filtered, 15);
  const bulk = useBulkSelection(filtered);
  const [bulkResult, setBulkResult] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const handleBulkDelete = async () => {
    if (!window.confirm(`Delete ${bulk.selectedCount} selected customer(s)? Customers with bills, orders, or outstanding balances will be skipped.`)) return;
    setDeleting(true);
    try {
      const res = await base44.functions.invoke("manageCustomer", { action: "bulk_delete", ids: bulk.selectedArray });
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
    if (data.mobile) {
      const dup = customers.find((c) => c.mobile === data.mobile && c.id !== editing?.id);
      if (dup) {
        alert("A customer with this mobile already exists: " + dup.name);
        return;
      }
    }
    try {
      if (editing) {
        const res = await base44.functions.invoke("manageCustomer", { action: "update", id: editing.id, data });
        if (!res.data?.success) { alert(res.data?.error || "Update failed"); return; }
      } else {
        const res = await base44.functions.invoke("manageCustomer", { action: "create", data });
        if (!res.data?.success) { alert(res.data?.error || "Create failed"); return; }
      }
      setOpen(false);
      setEditing(null);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const deletePermanent = async (c) => {
    if (!confirm(`Permanently delete customer "${c.name}"?\n\nIf this customer has bills, orders, or outstanding balances, deletion will be blocked with an explanation.`)) return;
    try {
      const res = await base44.functions.invoke("manageCustomer", { action: "delete_permanent", id: c.id });
      if (!res.data?.success) { alert(res.data?.error || "Delete failed"); return; }
      alert("Customer deleted permanently.");
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PageHeader
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-800 border border-amber-500/20">
            <Users className="w-3.5 h-3.5 text-amber-600" />
            <span>Customer Directory</span>
          </span>
        }
        title={t("customers.title")}
        subtitle="Manage your jewellery customer profiles, billing accounts, contact history, and outstanding ledgers."
        actions={
          <Button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {t("customers.newCustomer")}
          </Button>
        }
      />

      {/* Error state if load failed */}
      {error && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-red-200 bg-red-50 text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Customers"
          value={stats.total}
          sub={`${stats.clearCount} with zero balance`}
          icon={Users}
          accent="bg-blue-50 text-blue-700 border border-blue-200/60"
        />
        <StatCard
          label="Outstanding Dues"
          value={fmt(stats.totalDue)}
          sub={`${stats.withDueCount} account(s) have pending due`}
          icon={IndianRupee}
          accent={stats.totalDue > 0 ? "bg-amber-50 text-amber-700 border border-amber-200/60" : "bg-emerald-50 text-emerald-700 border border-emerald-200/60"}
        />
        <StatCard
          label="Accounts with Due"
          value={stats.withDueCount}
          sub={stats.total > 0 ? `${Math.round((stats.withDueCount / stats.total) * 100)}% of total clients` : "None"}
          icon={AlertCircle}
          accent="bg-rose-50 text-rose-700 border border-rose-200/60"
        />
        <StatCard
          label="New This Month"
          value={stats.recentCount}
          sub="Registered in past 30 days"
          icon={UserPlus}
          accent="bg-purple-50 text-purple-700 border border-purple-200/60"
        />
      </div>

      {/* Search & Filter Controls */}
      <div className="bg-card rounded-xl border border-border/80 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => { setQ(e.target.value); pag.setPage(1); }}
              placeholder="Search by name, mobile, code, GST, or city..."
              className="pl-9 bg-background"
            />
          </div>

          {/* Quick Segment Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/60 border border-border/60 self-start sm:self-auto overflow-x-auto">
            <button
              onClick={() => { setStatusFilter("all"); pag.setPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                statusFilter === "all"
                  ? "bg-background text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({customers.length})
            </button>
            <button
              onClick={() => { setStatusFilter("due"); pag.setPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                statusFilter === "due"
                  ? "bg-amber-500/15 text-amber-800 border border-amber-500/30 shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              With Dues ({stats.withDueCount})
            </button>
            <button
              onClick={() => { setStatusFilter("clear"); pag.setPage(1); }}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                statusFilter === "clear"
                  ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Clear ({stats.clearCount})
            </button>
          </div>
        </div>

        {/* Filter counter */}
        {(debouncedQ || statusFilter !== "all") && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
            <span>Showing {filtered.length} of {customers.length} customers</span>
            {(debouncedQ || statusFilter !== "all") && (
              <button
                onClick={() => { setQ(""); setStatusFilter("all"); pag.setPage(1); }}
                className="text-amber-700 hover:underline font-medium"
              >
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading Skeletons */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-4 border-b">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-4 w-20 bg-muted animate-pulse rounded" />
          </div>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-2">
              <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                <div className="h-3 w-32 bg-muted/60 animate-pulse rounded" />
              </div>
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-dashed border-border/90 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="font-display text-lg font-bold text-foreground">
            {customers.length === 0 ? t("customers.noCustomers") : "No matching customers found"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
            {customers.length === 0
              ? "Start building your customer relationship directory. Add your regular buyers and manage credits, billing, and order histories effortlessly."
              : `No customer records matched your query "${debouncedQ}". Try searching with a different mobile number or customer code.`}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            {customers.length === 0 ? (
              <Button
                onClick={() => { setEditing(null); setOpen(true); }}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                {t("customers.newCustomer")}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => { setQ(""); setStatusFilter("all"); pag.setPage(1); }}
              >
                Clear Search Filter
              </Button>
            )}
          </div>
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
                aria-label="Select all customers"
              />,
              "Customer",
              "Customer Code",
              "Mobile Contact",
              "GST Number",
              t("customers.outstanding"),
              "Notes",
              t("common.actions")
            ]}
          >
            {pag.pageItems.map((c) => {
              const outstandingAmt = Number(c.outstanding || 0);
              const initials = c.name ? c.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "C";

              return (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-4 py-3.5">
                    <Checkbox
                      checked={bulk.isSelected(c.id)}
                      onCheckedChange={() => bulk.toggleOne(c.id)}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>

                  {/* Customer Avatar & Name */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 border border-amber-300/60 text-amber-800 font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <button
                          onClick={() => navigate(`/customers/${c.id}`)}
                          className="font-semibold text-sm text-foreground hover:text-amber-700 transition-colors truncate block text-left"
                          title="View Customer Profile"
                        >
                          {c.name}
                        </button>
                        {c.city && <span className="text-[11px] text-muted-foreground block truncate">{c.city}</span>}
                      </div>
                    </div>
                  </td>

                  {/* Customer Code */}
                  <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground font-medium">
                    {c.customer_code ? (
                      <span className="px-2 py-0.5 rounded bg-muted border border-border text-foreground font-mono">
                        {c.customer_code}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>

                  {/* Mobile Contact */}
                  <td className="px-4 py-3.5 text-xs">
                    {c.mobile ? (
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <Phone className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span>{c.mobile}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* GST */}
                  <td className="px-4 py-3.5 text-xs font-mono text-muted-foreground">
                    {c.gst_number || "—"}
                  </td>

                  {/* Outstanding Dues */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {outstandingAmt > 0 ? (
                      <Badge variant="warning" dot={true} className="font-semibold font-mono">
                        {fmt(outstandingAmt)} Due
                      </Badge>
                    ) : (
                      <Badge variant="success" dot={true}>
                        Clear
                      </Badge>
                    )}
                  </td>

                  {/* Notes */}
                  <td className="px-4 py-3.5 text-xs text-muted-foreground max-w-[180px] truncate" title={c.notes}>
                    {c.notes || "—"}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate(`/customers/${c.id}`)}
                        className="p-1.5 rounded-lg hover:bg-amber-500/10 text-amber-700 transition-colors"
                        title={t("customers.viewHistory")}
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate("/billing")}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/10 text-emerald-700 transition-colors"
                        title={t("customers.createBill")}
                      >
                        <Receipt className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setEditing(c); setOpen(true); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit Customer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deletePermanent(c)}
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

      {/* Modern Customer Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-lg">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
              {editing ? t("customers.editCustomer") : t("customers.newCustomer")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {editing ? "Update client contact information and tax identifiers." : "Enter client personal and tax information for sales invoices and loyalty tracking."}
            </DialogDescription>
          </DialogHeader>
          <CustomerForm initial={editing} onSave={save} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerForm({ initial, onSave, onCancel }) {
  const t = useT();
  const [f, setF] = useState({
    name: initial?.name || "",
    mobile: initial?.mobile || "",
    gst_number: initial?.gst_number || "",
    birth_date: initial?.birth_date || "",
    notes: initial?.notes || "",
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="sm:col-span-2">
          <Label className="text-xs font-semibold text-foreground">
            {t("common.name")} <span className="text-red-500">*</span>
          </Label>
          <Input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            placeholder="e.g. Rameshwar Soni"
            className="mt-1"
            autoFocus
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">{t("common.mobile")}</Label>
          <Input
            value={f.mobile}
            onChange={(e) => setF({ ...f, mobile: e.target.value })}
            placeholder="e.g. 9876543210"
            className="mt-1 font-mono text-sm"
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">{t("customers.gstNumber")}</Label>
          <Input
            value={f.gst_number}
            onChange={(e) => setF({ ...f, gst_number: e.target.value })}
            placeholder="27AAAAA0000A1Z5"
            className="mt-1 font-mono text-sm uppercase"
          />
        </div>

        <div>
          <Label className="text-xs font-semibold text-foreground">{t("customers.birthDate")}</Label>
          <Input
            type="date"
            value={f.birth_date || ""}
            onChange={(e) => setF({ ...f, birth_date: e.target.value })}
            className="mt-1 text-sm"
          />
        </div>

        <div className="sm:col-span-2">
          <Label className="text-xs font-semibold text-foreground">{t("common.notes")}</Label>
          <Input
            value={f.notes}
            onChange={(e) => setF({ ...f, notes: e.target.value })}
            placeholder="Preferred jewellery type, anniversary, references..."
            className="mt-1"
          />
        </div>
      </div>

      <DialogFooter className="pt-3 border-t border-border">
        <Button variant="outline" onClick={onCancel} type="button">
          {t("common.cancel")}
        </Button>
        <Button
          onClick={() => f.name && onSave(f)}
          disabled={!f.name?.trim()}
          className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
        >
          {t("common.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}