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

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")}
        actions={<Button onClick={() => setInviteOpen(true)}><UserPlus className="w-4 h-4 mr-1" /> {t("admin.inviteUser")}</Button>} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Members */}
        <div className="lg:col-span-2 rounded-xl border bg-card overflow-hidden">
          <h3 className="font-display font-semibold px-5 py-3 border-b">Shop Members</h3>
          {loading ? <div className="p-5"><Spinner /></div> : members.length === 0 ? (
            <EmptyState title="No members yet" description="Invite users to your shop." />
          ) : (
            <TableShell headers={["User", "Email", "Role", "Status", "Actions"]}>
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="font-medium">{m.user_name || m.user_email?.split("@")[0] || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{m.user_email || "—"}</td>
                  <td className="px-4 py-3">
                    {m.user_id === user.id ? (
                      <Badge variant="info">{m.role}</Badge>
                    ) : (
                      <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                        <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
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
                    <div className="flex gap-1">
                      {m.status === "active" && m.user_id !== user.id && (
                        <button onClick={() => toggleMember(m.id, "deactivate")} className="p-1.5 rounded hover:bg-muted text-orange-600" title="Suspend"><Ban className="w-3.5 h-3.5" /></button>
                      )}
                      {m.status !== "active" && (
                        <button onClick={() => toggleMember(m.id, "reactivate")} className="p-1.5 rounded hover:bg-muted text-emerald-600" title="Reactivate"><RotateCcw className="w-3.5 h-3.5" /></button>
                      )}
                      {m.user_id !== user.id && (
                        <button onClick={() => setDeleteTarget(m)} className="p-1.5 rounded hover:bg-muted text-red-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </TableShell>
          )}
        </div>

        {/* Activity Log */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> {t("admin.auditLog")}</h3>
          {loading ? <Spinner /> : logs.length === 0 ? <EmptyState title="No activity yet" /> : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className="text-xs border-b pb-2">
                  <p><span className="font-medium">{l.user_name || "system"}</span> · <span className="text-amber-700">{l.action}</span> in <span className="capitalize">{l.module}</span></p>
                  <p className="text-muted-foreground">{new Date(l.timestamp).toLocaleString("en-IN")}{l.reason ? ` · ${l.reason}` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Role permissions info */}
      <div className="mt-6 rounded-xl border bg-card p-5">
        <h3 className="font-display font-semibold mb-3">{t("admin.rolePermissions")}</h3>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          {[
            { role: "Admin", desc: "Full access to all modules including settings, rates, roles and data.", variant: "info" },
            { role: "Staff", desc: "Inventory, customers, purchases, orders. No rate/role management.", variant: "success" },
            { role: "Cashier", desc: "Billing and customers only. No rate changes, no record deletion.", variant: "warning" },
          ].map((r) => (
            <div key={r.role} className="flex gap-3">
              <Badge variant={r.variant}>{r.role}</Badge>
              <p className="text-muted-foreground">{r.desc}</p>
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