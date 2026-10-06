import React from "react";
import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { usePermission } from "@/lib/permissions";
import { Receipt, Package, PlusCircle, ShoppingCart, UserPlus, Coins, Gem, TrendingUp } from "lucide-react";

export default function QuickActions() {
  const t = useT();
  const { can, canAny } = usePermission();

  const actions = [
    { label: t("dashboard.qa.newBill"), to: "/billing", icon: Receipt, show: can("billing", "create"), accent: "bg-amber-50 text-amber-700 hover:bg-amber-100" },
    { label: t("dashboard.qa.newItemStock"), to: "/inventory/gold", icon: Package, show: can("inventory", "create"), accent: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
    { label: t("dashboard.qa.addStock"), to: "/inventory/gold", icon: PlusCircle, show: can("inventory", "update"), accent: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100" },
    { label: t("dashboard.qa.newPurchase"), to: "/purchase/management", icon: ShoppingCart, show: can("purchase", "create"), accent: "bg-purple-50 text-purple-700 hover:bg-purple-100" },
    { label: t("dashboard.qa.addCustomer"), to: "/customers", icon: UserPlus, show: can("customers", "create"), accent: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { label: t("dashboard.qa.goldInventory"), to: "/inventory/gold", icon: Coins, show: canAny("inventory"), accent: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100" },
    { label: t("dashboard.qa.silverInventory"), to: "/inventory/silver", icon: Gem, show: canAny("inventory"), accent: "bg-slate-100 text-slate-700 hover:bg-slate-200" },
    { label: t("dashboard.qa.todayRates"), to: "/rates", icon: TrendingUp, show: canAny("rates"), accent: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
  ].filter((a) => a.show);

  if (actions.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="font-display font-semibold mb-3">{t("dashboard.quickActions")}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <Link
              key={i}
              to={a.to}
              className={`flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition-colors ${a.accent}`}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/60 shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">{a.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}