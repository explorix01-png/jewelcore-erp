import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/erp";
import { Lock, Database, ArrowDownToLine, ArrowUpFromLine, RotateCcw, Sparkles, AlertTriangle, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImportSection from "@/components/data/ImportSection";
import ExportSection from "@/components/data/ExportSection";
import BackupSection from "@/components/data/BackupSection";
import RestoreSection from "@/components/data/RestoreSection";
import SampleDataSection from "@/components/data/SampleDataSection";
import DeletionSection from "@/components/data/DeletionSection";

export default function DataManagement() {
  const { user } = useAuth();
  const t = useT();
  const isAdmin = (user?.active_shop_role || user?.data?.active_shop_role) === "admin";

  if (!isAdmin) {
    return (
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <PageHeader title={t("data.title")} />
        <div className="flex flex-col items-center justify-center py-16 text-center bg-card rounded-2xl border border-slate-200/80 shadow-sm mt-6">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-4 border border-red-100">
            <Lock className="w-7 h-7 text-red-600" />
          </div>
          <p className="font-display font-semibold text-lg text-slate-900">{t("admin.accessDenied")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{t("admin.accessDeniedDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={t("data.title")}
        subtitle={t("data.subtitle")}
        badge={
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" /> Tenant-Isolated Data Vault
          </span>
        }
      />

      {/* Security Status Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Database Engine</p>
            <p className="font-semibold text-sm text-slate-900 mt-0.5">PostgreSQL Multi-Tenant</p>
            <p className="text-[11px] text-emerald-600 font-medium">Encrypted & Operational</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active Store Scope</p>
            <p className="font-semibold text-sm text-slate-900 mt-0.5">{user?.shop_name || "Primary Jewellery Shop"}</p>
            <p className="text-[11px] text-muted-foreground">Strict Tenant Boundary</p>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm border-slate-200/80 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200 shrink-0">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Disaster Recovery</p>
            <p className="font-semibold text-sm text-slate-900 mt-0.5">JSON Snapshot Archival</p>
            <p className="text-[11px] text-muted-foreground">Export / Restore Enabled</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm border-slate-200/80 p-5 lg:p-6">
        <Tabs defaultValue="backup" className="w-full">
          <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full mb-6 bg-slate-100/80 p-1 rounded-xl h-auto gap-1">
            <TabsTrigger value="backup" className="text-xs py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex items-center gap-1.5 font-medium">
              <Database className="w-3.5 h-3.5" /> Backup
            </TabsTrigger>
            <TabsTrigger value="export" className="text-xs py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex items-center gap-1.5 font-medium">
              <ArrowUpFromLine className="w-3.5 h-3.5" /> Export
            </TabsTrigger>
            <TabsTrigger value="import" className="text-xs py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex items-center gap-1.5 font-medium">
              <ArrowDownToLine className="w-3.5 h-3.5" /> Import
            </TabsTrigger>
            <TabsTrigger value="restore" className="text-xs py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex items-center gap-1.5 font-medium">
              <RotateCcw className="w-3.5 h-3.5" /> Restore
            </TabsTrigger>
            <TabsTrigger value="sample" className="text-xs py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex items-center gap-1.5 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Sample Data
            </TabsTrigger>
            <TabsTrigger value="deletion" className="text-xs py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg flex items-center gap-1.5 font-medium text-red-600 data-[state=active]:text-red-700">
              <AlertTriangle className="w-3.5 h-3.5" /> Clean / Purge
            </TabsTrigger>
          </TabsList>
          <TabsContent value="backup" className="mt-0 focus-visible:outline-none"><BackupSection /></TabsContent>
          <TabsContent value="export" className="mt-0 focus-visible:outline-none"><ExportSection /></TabsContent>
          <TabsContent value="import" className="mt-0 focus-visible:outline-none"><ImportSection /></TabsContent>
          <TabsContent value="restore" className="mt-0 focus-visible:outline-none"><RestoreSection /></TabsContent>
          <TabsContent value="sample" className="mt-0 focus-visible:outline-none"><SampleDataSection /></TabsContent>
          <TabsContent value="deletion" className="mt-0 focus-visible:outline-none"><DeletionSection /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}