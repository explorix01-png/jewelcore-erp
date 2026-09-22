import React from "react";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/erp";
import { Lock } from "lucide-react";
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
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-3"><Lock className="w-6 h-6 text-red-600" /></div>
          <p className="font-medium">{t("admin.accessDenied")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("admin.accessDeniedDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <PageHeader title={t("data.title")} subtitle={t("data.subtitle")} />
      <Tabs defaultValue="import">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 w-full mb-6">
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="restore">Restore</TabsTrigger>
          <TabsTrigger value="sample">Sample Data</TabsTrigger>
          <TabsTrigger value="deletion">Deletion</TabsTrigger>
        </TabsList>
        <TabsContent value="import"><ImportSection /></TabsContent>
        <TabsContent value="export"><ExportSection /></TabsContent>
        <TabsContent value="backup"><BackupSection /></TabsContent>
        <TabsContent value="restore"><RestoreSection /></TabsContent>
        <TabsContent value="sample"><SampleDataSection /></TabsContent>
        <TabsContent value="deletion"><DeletionSection /></TabsContent>
      </Tabs>
    </div>
  );
}