import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { PageHeader, Spinner, EmptyState, Badge, TableShell } from "@/components/ui/erp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Shield, UserPlus, Mail, Ban, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// Admin Control — tenant-scoped user/membership management via manageMembers backend.
// Uses active_shop_role from ShopMembership (never platform user.role).
export default function AdminControl() {
  const t = useT();
  const { user } = useAuth();
  const role = user?.active_shop_role || user?.data?.active_shop_role || "staff";
  const isAdmin = role === "admin";
  const [members, setMembers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [memRes, logData] = await Promise.all([
        base44.functions.invoke("manageMembers", { action: "list" }),
        base44.entities.ActivityLog.list("-timestamp", 100),
      ]);
      if (memRes.data?.success) setMembers(memRes.data.members);
      setLogs(logData);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) {
    return <Navigate to="/billing" replace />;
  }

  const changeRole = async (membershipId, newRole) => {
    try {
      const res = await base44.functions.invoke("manageMembers", { action: "update_role", membership_id: membershipId, role: newRole });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      load();
    } catch (e) { alert("Failed: " + (e.response?.data?.error || e.message)); }
  };

  const toggleMember = async (membershipId, action) => {
    try {
      const res = await base44.functions.invoke("manageMembers", { action, membership_id: membershipId });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      load();
    } catch (e) { alert("Failed: " + (e.response?.data?.error || e.message)); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await base44.functions.invoke("manageMembers", { action: "delete", membership_id: deleteTarget.id });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      setDeleteTarget(null);
      load();
    } catch (e) { alert("Failed: " + (e.response?.data?.error || e.message)); }
  };

  const activeCount = members.filter((m) => m.status === "active").length;
  const adminCount = members.filter((m) => m.role === "admin").length;

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={t("admin.title")}
        subtitle={t("admin.subtitle")}
        badge={<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><Shield className="w-3 h-3 text-emerald-600" /> Tenant Scoped RBAC</span>}
        actions={
          <Button onClick={() => setInviteOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white shadow-sm">
            <UserPlus className="w-4 h-4 mr-1.5" /> {t("admin.inviteUser")}
          </Button>
        }
      />

      {/* Admin KPI Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Members</p>
          <p className="font-mono text-2xl font-bold text-slate-900 mt-1">{members.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Configured shop users</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active Members</p>
          <p className="font-mono text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Granted terminal access</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Shop Admins</p>
          <p className="font-mono text-2xl font-bold text-amber-600 mt-1">{adminCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Full privileged access</p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Audit Stream</p>
          <p className="font-mono text-2xl font-bold text-blue-600 mt-1">{logs.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1">Immutable security events</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Members */}
        <div className="lg:col-span-2 rounded-xl border bg-card overflow-hidden shadow-sm border-slate-200/80">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="font-display font-semibold text-slate-900 text-sm">Shop Team Members</h3>
              <p className="text-xs text-muted-foreground">Assign or revoke staff roles in real time</p>
            </div>
            <span className="text-xs font-mono bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium">
              {members.length} {members.length === 1 ? "user" : "users"}
            </span>
          </div>
          {loading ? (
            <div className="p-12 text-center"><Spinner /></div>
          ) : members.length === 0 ? (
            <EmptyState title="No members yet" description="Invite team members and cashiers to your jewellery shop." />
          ) : (
            <TableShell headers={["User Details", "Contact", "Store Role", "Status", "Actions"]}>
              {members.map((m) => {
                const displayName = m.user_name || m.user_email?.split("@")[0] || "User";
                const initials = displayName.slice(0, 2).toUpperCase();
                const isCurrent = m.user_id === user.id;

                return (
                  <tr key={m.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-900 font-semibold text-xs flex items-center justify-center border border-amber-200 shrink-0">
                          {initials}
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                            {displayName}
                            {isCurrent && <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded">You</span>}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">UID: {m.user_id?.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 font-mono">{m.user_email || "—"}</td>
                    <td className="px-4 py-3">
                      {isCurrent ? (
                        <Badge variant="info">{m.role}</Badge>
                      ) : (
                        <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                          <SelectTrigger className="h-8 w-28 text-xs font-medium border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="cashier">Cashier</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={m.status === "active" ? "success" : m.status === "invited" ? "warning" : "default"}>
                        {m.status || "active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {m.status === "active" && !isCurrent && (
                          <button
                            onClick={() => toggleMember(m.id, "deactivate")}
                            className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-600 transition-colors"
                            title="Suspend Access"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                        {m.status !== "active" && (
                          <button
                            onClick={() => toggleMember(m.id, "reactivate")}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                            title="Reactivate Access"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        )}
                        {!isCurrent && (
                          <button
                            onClick={() => setDeleteTarget(m)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                            title="Remove Member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </TableShell>
          )}
        </div>

        {/* Activity Log */}
        <div className="rounded-xl border bg-card p-5 shadow-sm border-slate-200/80 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <h3 className="font-display font-semibold text-sm flex items-center gap-2 text-slate-900">
              <Shield className="w-4 h-4 text-amber-600" /> {t("admin.auditLog")}
            </h3>
            <span className="text-[11px] text-muted-foreground font-mono">Live</span>
          </div>
          {loading ? (
            <div className="p-8 text-center"><Spinner /></div>
          ) : logs.length === 0 ? (
            <EmptyState title="No activity yet" description="Security and operational actions will appear here." />
          ) : (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1 text-xs">
              {logs.map((l) => (
                <div key={l.id} className="p-2.5 rounded-lg bg-slate-50/80 border border-slate-100 hover:border-slate-200 transition-colors">
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="font-semibold text-slate-800">{l.user_name || "System"}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {new Date(l.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    <span className="font-medium text-amber-700">{l.action}</span> in{" "}
                    <span className="capitalize font-medium text-slate-700">{l.module}</span>
                  </p>
                  {l.reason && <p className="text-[11px] text-slate-500 italic mt-0.5">{l.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Role permissions info */}
      <div className="rounded-xl border bg-card p-5 shadow-sm border-slate-200/80">
        <h3 className="font-display font-semibold text-sm text-slate-900 mb-3">{t("admin.rolePermissions")}</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-xs">
          {[
            { role: "Admin", desc: "Full administrative access to all jewellery modules, store settings, daily metal rates, team roles, and data backup/restore.", variant: "info" },
            { role: "Staff", desc: "Access to inventory management, customers, purchase inwards, and order processing. Excludes rate edits and member role changes.", variant: "success" },
            { role: "Cashier", desc: "Dedicated point-of-sale billing and customer receipts. Cannot modify daily metal rates, delete records, or access back-office settings.", variant: "warning" },
          ].map((r) => (
            <div key={r.role} className="flex gap-3 p-3 rounded-lg bg-slate-50/50 border border-slate-100">
              <Badge variant={r.variant} className="shrink-0 h-fit">{r.role}</Badge>
              <p className="text-slate-600 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={load} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete member?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleteTarget?.user_name || deleteTarget?.user_email} from this shop and clears their role. Their user account remains on the platform. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InviteDialog({ open, onClose, onInvited }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);

  const invite = async () => {
    if (!email) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("manageMembers", {
        action: "invite", email, name, role,
      });
      if (!res.data?.success) { alert(res.data?.error || "Failed"); return; }
      alert(`Invitation sent to ${email} as ${role}`);
      onClose(); setEmail(""); setName(""); setRole("staff");
      onInvited();
    } catch (e) { alert("Failed: " + (e.response?.data?.error || e.message)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}><DialogContent>
      <DialogHeader><DialogTitle>{t("admin.inviteUser")}</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <div><Label>{t("common.name")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></div>
        <div><Label>Email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>Role</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="cashier">Cashier</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
        <Button onClick={invite} disabled={saving || !email}>
          {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</> : <><Mail className="w-4 h-4 mr-1" /> Send Invite</>}
        </Button>
      </DialogFooter>
    </DialogContent></Dialog>
  );
}