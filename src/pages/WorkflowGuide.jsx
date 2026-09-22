import React from "react";
import { useT } from "@/lib/i18n";
import { PageHeader } from "@/components/ui/erp";
import {
  Settings, Percent, Database, Package, ShoppingBag, Receipt, CreditCard,
  ArrowRight, ArrowDown, AlertCircle, BookOpen, CheckCircle2, TrendingUp,
  User, FileText, History, Cog, Plus, Sun, Moon, Clock, Coins,
  Scale, Gem, Users, Shield, HardDrive, IndianRupee,
} from "lucide-react";

export default function WorkflowGuide() {
  const t = useT();

  const FlowCard = ({ icon: Icon, color, title, description, steps, note }) => (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-display font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="flex flex-col">
        {steps.map((s, i) => {
          const SIcon = s.icon;
          return (
            <React.Fragment key={i}>
              <div className="flex items-center gap-2.5 py-1.5">
                <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <SIcon className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm">{s.label}</span>
              </div>
              {i < steps.length - 1 && <ArrowDown className="w-3 h-3 text-muted-foreground ml-[22px]" />}
            </React.Fragment>
          );
        })}
      </div>
      {note && (
        <div className="mt-3 rounded-lg bg-amber-50/50 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800">{note}</p>
        </div>
      )}
    </div>
  );

  const ConceptCard = ({ icon: Icon, color, title, formula, description }) => (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <h3 className="font-display font-semibold text-sm">{title}</h3>
      </div>
      {formula && (
        <div className="rounded-lg bg-muted/60 p-3 mb-2">
          <p className="text-sm font-mono text-center font-semibold">{formula}</p>
        </div>
      )}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <PageHeader title={t("workflow.title")} subtitle={t("workflow.subtitle")} />

      {/* Core Principle */}
      <div className="rounded-xl border bg-amber-50/30 p-5 mb-6">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4" /> {t("workflow.howItWorks")}</h3>
        <p className="text-sm text-muted-foreground">{t("workflow.corePrinciple")}</p>
      </div>

      {/* Overview Flow */}
      <div className="rounded-xl border bg-card p-4 sm:p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { icon: Settings, label: t("workflow.setup") },
            { icon: Percent, label: t("workflow.goldRate") },
            { icon: Database, label: t("workflow.masterData") },
            { icon: Plus, label: t("nav.addPurchase") },
            { icon: ShoppingBag, label: t("nav.purchaseManagement") },
            { icon: Package, label: t("workflow.inventory") },
            { icon: Receipt, label: t("workflow.bill") },
            { icon: CreditCard, label: t("workflow.payment") },
            { icon: FileText, label: t("workflow.invoice") },
            { icon: History, label: t("workflow.customerHistory") },
            { icon: TrendingUp, label: t("workflow.dashboard") },
          ].map((s, i, arr) => {
            const Icon = s.icon;
            return (
              <React.Fragment key={i}>
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border">{<Icon className="w-3 h-3" />} {s.label}</span>
                {i < arr.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        {/* Initial Setup */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-1">{t("workflow.initialSetup")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("workflow.initialSetupDesc")}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: Settings, label: t("workflow.stepSettings"), desc: t("workflow.stepSettingsDesc") },
              { icon: Percent, label: t("workflow.stepRates"), desc: t("workflow.stepRatesDesc") },
              { icon: Database, label: t("workflow.stepPurity"), desc: t("workflow.stepPurityDesc") },
              { icon: Database, label: t("workflow.stepCategory"), desc: t("workflow.stepCategoryDesc") },
              { icon: Package, label: t("workflow.stepInventory"), desc: t("workflow.stepInventoryDesc") },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-start gap-3 rounded-lg border p-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 text-sm font-semibold">{i + 1}</div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <p className="text-sm font-medium">{s.label}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Module Overview */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-1">{t("workflow.modulesTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("workflow.modulesDesc")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { icon: Settings, label: t("workflow.modSetup"), desc: t("workflow.modSetupDesc") },
              { icon: Percent, label: t("workflow.modRates"), desc: t("workflow.modRatesDesc") },
              { icon: Database, label: t("workflow.modMaster"), desc: t("workflow.modMasterDesc") },
              { icon: Plus, label: t("workflow.modAddPurchase"), desc: t("workflow.modAddPurchaseDesc") },
              { icon: ShoppingBag, label: t("workflow.modPurchaseMgmt"), desc: t("workflow.modPurchaseMgmtDesc") },
              { icon: Package, label: t("workflow.modInventory"), desc: t("workflow.modInventoryDesc") },
              { icon: Users, label: t("workflow.modCustomers"), desc: t("workflow.modCustomersDesc") },
              { icon: Receipt, label: t("workflow.modBilling"), desc: t("workflow.modBillingDesc") },
              { icon: CreditCard, label: t("workflow.modPayments"), desc: t("workflow.modPaymentsDesc") },
              { icon: Gem, label: t("workflow.modOrders"), desc: t("workflow.modOrdersDesc") },
              { icon: Shield, label: t("workflow.modAdmin"), desc: t("workflow.modAdminDesc") },
              { icon: HardDrive, label: t("workflow.modData"), desc: t("workflow.modDataDesc") },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-start gap-2.5 rounded-lg border p-3">
                  <Icon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Purchase Flow */}
        <FlowCard
          icon={Plus} color="bg-indigo-50 text-indigo-700"
          title={t("workflow.addPurchaseTitle")}
          description={t("workflow.addPurchaseDesc")}
          steps={[
            { icon: Plus, label: t("nav.addPurchase") },
            { icon: Gem, label: t("workflow.selectGoldSilver") },
            { icon: Package, label: t("workflow.selectExistingItem") },
            { icon: Scale, label: t("workflow.enterWeights") },
            { icon: CheckCircle2, label: t("common.save") },
            { icon: TrendingUp, label: t("workflow.inventoryAutoIncreases") },
          ]}
          note={t("workflow.addPurchaseNote")}
        />

        {/* Purchase Management Flow */}
        <FlowCard
          icon={ShoppingBag} color="bg-purple-50 text-purple-700"
          title={t("workflow.purchaseMgmtTitle")}
          description={t("workflow.purchaseMgmtDesc")}
          steps={[
            { icon: ShoppingBag, label: t("nav.purchaseManagement") },
            { icon: ShoppingBag, label: t("workflow.selectSupplier") },
            { icon: Plus, label: t("purchase.newPurchaseDoc") },
            { icon: Package, label: t("workflow.enterPurchaseDetails") },
            { icon: Percent, label: t("workflow.applyGst") },
            { icon: CheckCircle2, label: t("workflow.finalizePurchase") },
            { icon: FileText, label: t("workflow.invoiceAvailable") },
          ]}
          note={t("workflow.purchaseMgmtNote")}
        />

        {/* Billing Modes Section */}
        <div className="rounded-xl border bg-amber-50/20 p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-1">{t("workflow.billingModesTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("workflow.billingModesDesc")}</p>
          <div className="space-y-4">
            {/* Inventory Bill */}
            <FlowCard
              icon={Receipt} color="bg-amber-50 text-amber-700"
              title={t("workflow.inventoryBillTitle")}
              description={t("workflow.inventoryBillDesc")}
              steps={[
                { icon: User, label: t("workflow.selectCustomer") },
                { icon: Package, label: t("workflow.selectItemBarcode") },
                { icon: Cog, label: t("workflow.calcBill") },
                { icon: Cog, label: t("workflow.applyMaking") },
                { icon: Percent, label: t("workflow.applyGst") },
                { icon: CreditCard, label: t("workflow.selectPaymentMode") },
                { icon: Receipt, label: t("workflow.finalize") },
                { icon: TrendingUp, label: t("workflow.inventoryAutoDecreases") },
              ]}
              note={t("workflow.inventoryBillNote")}
            />

            {/* Manual Bill */}
            <FlowCard
              icon={FileText} color="bg-blue-50 text-blue-700"
              title={t("workflow.manualBillTitle")}
              description={t("workflow.manualBillDesc")}
              steps={[
                { icon: User, label: t("workflow.selectCustomer") },
                { icon: Plus, label: t("workflow.addManualItem") },
                { icon: Cog, label: t("workflow.enterItemDetails") },
                { icon: Cog, label: t("workflow.calcBill") },
                { icon: CreditCard, label: t("workflow.selectPaymentMode") },
                { icon: Receipt, label: t("workflow.finalize") },
              ]}
              note={t("workflow.manualBillNote")}
            />

            {/* Customer Gold/Silver Purchase */}
            <FlowCard
              icon={Coins} color="bg-emerald-50 text-emerald-700"
              title={t("workflow.customerPurchaseTitle")}
              description={t("workflow.customerPurchaseDesc")}
              steps={[
                { icon: User, label: t("workflow.selectCustomer") },
                { icon: Plus, label: t("workflow.addPurchaseItem") },
                { icon: Gem, label: t("workflow.selectGoldSilver") },
                { icon: Scale, label: t("workflow.enterWeights") },
                { icon: Cog, label: t("workflow.enterMakingWastage") },
                { icon: CreditCard, label: t("workflow.selectPaymentMode") },
                { icon: Receipt, label: t("workflow.finalize") },
              ]}
              note={t("workflow.customerPurchaseNote")}
            />
          </div>
        </div>

        {/* Weight & Charge Concepts */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-1">{t("workflow.weightChargesTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("workflow.weightChargesDesc")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ConceptCard
              icon={Scale} color="bg-blue-50 text-blue-700"
              title={t("workflow.lessWeightTitle")}
              formula={t("workflow.lessWeightFormula")}
              description={t("workflow.lessWeightDesc")}
            />
            <ConceptCard
              icon={Scale} color="bg-indigo-50 text-indigo-700"
              title={t("workflow.fineWeightTitle")}
              formula={t("workflow.fineWeightFormula")}
              description={t("workflow.fineWeightDesc")}
            />
            <ConceptCard
              icon={Cog} color="bg-amber-50 text-amber-700"
              title={t("workflow.makingChargeTitle")}
              formula={t("workflow.makingChargeFormula")}
              description={t("workflow.makingChargeDesc")}
            />
            <ConceptCard
              icon={Percent} color="bg-purple-50 text-purple-700"
              title={t("workflow.silverWastageTitle")}
              formula={t("workflow.silverWastageFormula")}
              description={t("workflow.silverWastageDesc")}
            />
            <ConceptCard
              icon={IndianRupee} color="bg-emerald-50 text-emerald-700"
              title={t("workflow.otherChargesTitle")}
              formula={t("workflow.otherChargesFormula")}
              description={t("workflow.otherChargesDesc")}
            />
            <ConceptCard
              icon={Percent} color="bg-red-50 text-red-700"
              title={t("workflow.gstTitle")}
              formula={t("workflow.gstFormula")}
              description={t("workflow.gstDesc")}
            />
          </div>
        </div>

        {/* Payment Modes */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-1">{t("workflow.paymentModesTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("workflow.paymentModesDesc")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-4">
            {["cash", "upi", "card", "bank_transfer", "credit_due", "mixed", "old_gold_exchange", "old_gold_cash"].map((m) => (
              <div key={m} className="flex items-center gap-2 rounded-lg border p-2.5">
                <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm">{t("paymentMode." + m)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-amber-50/40 p-4">
              <p className="text-sm font-semibold mb-3">{t("workflow.oldGoldExchangeTitle")}</p>
              <div className="space-y-1 text-sm font-mono text-muted-foreground">
                <p>{t("billing.grandTotal")}</p>
                <p>− {t("billing.oldGoldValue")}</p>
                <p className="border-t border-amber-200 pt-1 text-foreground">= {t("workflow.balanceDue")}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-3">{t("workflow.oldGoldExchangeCalc")}</p>
            </div>
            <div className="rounded-lg bg-indigo-50/40 p-4">
              <p className="text-sm font-semibold mb-3">{t("workflow.oldGoldCashTitle")}</p>
              <div className="space-y-1 text-sm font-mono text-muted-foreground">
                <p>{t("billing.grandTotal")}</p>
                <p>− {t("billing.oldGoldValue")}</p>
                <p>− {t("billing.cashPaid")}</p>
                <p className="border-t border-indigo-200 pt-1 text-foreground">= {t("workflow.dueAmount")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Daily Workflow */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-4">{t("workflow.dailyWorkflowTitle")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg bg-amber-50/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sun className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold">{t("workflow.morning")}</p>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <p>{t("workflow.stepRates")}</p>
                <ArrowDown className="w-3 h-3 text-muted-foreground" />
                <p>{t("workflow.checkInventory")}</p>
              </div>
            </div>
            <div className="rounded-lg bg-blue-50/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-semibold">{t("workflow.duringDay")}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <p>{t("workflow.purchaseStockIn")}</p>
                <p>{t("workflow.billingStockOut")}</p>
                <p>{t("workflow.customerPayments")}</p>
              </div>
            </div>
            <div className="rounded-lg bg-emerald-50/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Moon className="w-4 h-4 text-emerald-600" />
                <p className="text-sm font-semibold">{t("workflow.endOfDay")}</p>
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <p>{t("workflow.dashboard")}</p>
                <p>{t("workflow.salesPayments")}</p>
                <p>{t("workflow.pendingDues")}</p>
                <p>{t("workflow.recentBillsPurchases")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Key Principles */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="font-display font-semibold mb-4">{t("workflow.keyPrinciples")}</h3>
          <div className="space-y-2">
            {[
              t("workflow.principle1"),
              t("workflow.principle0"),
              t("workflow.principle2"),
              t("workflow.principle3"),
              t("workflow.principle4"),
              t("workflow.principle5"),
              t("workflow.principle6"),
              t("workflow.principle7"),
            ].map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="rounded-xl border bg-amber-50/30 p-5 mt-6">
        <div className="flex flex-col gap-2 text-sm font-medium">
          {["setupOnce", "manageInventory", "purchaseAdds", "billingReduces", "paymentRecorded2", "autoUpdate"].map((k) => (
            <div key={k} className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{t("workflow." + k)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}