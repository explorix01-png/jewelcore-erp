import React from "react";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/erp";
import PurchaseStockWorkspace from "@/components/purchase/PurchaseStockWorkspace";

export default function PurchaseAdd() {
  const t = useT();
  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title={t("purchase.addPurchaseTitle")} subtitle={t("purchase.addPurchaseSubtitle")} />
      <PurchaseStockWorkspace />
    </div>
  );
}