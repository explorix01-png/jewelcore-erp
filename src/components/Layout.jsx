import React, { useState, useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePermission } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationBell from "@/components/NotificationBell";
import VoiceAssistant from "@/components/voice/VoiceAssistant";
import ShopSwitcher from "@/components/ShopSwitcher";
import PWAInstallButton from "@/components/PWAInstallButton";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OfflineStatusBanner, ConnectionIndicator } from "@/components/OfflineStatusBanner";
import {
  LayoutDashboard, Receipt, History, Users, Truck, ShoppingBag,
  ClipboardList, Hammer, Shield, Database, Percent, Settings as SettingsIcon, SlidersHorizontal,
  LogOut, Menu, X, Coins, BookOpen, Plus, ChevronRight, Gem
} from "lucide-react";

const NAV = [
  {
    group: "nav.group.overview",
    items: [
      { label: "nav.dashboard", path: "/", icon: LayoutDashboard, module: "dashboard" },
    ]
  },
  {
    group: "nav.group.sales",
    items: [
      { label: "nav.billing", path: "/billing", icon: Receipt, module: "billing" },
      { label: "nav.bills", path: "/bills", icon: History, module: "bills" },
      { label: "nav.customers", path: "/customers", icon: Users, module: "customers" },
      { label: "nav.orders", path: "/orders", icon: ClipboardList, module: "orders" },
      { label: "nav.karagir", path: "/karagir", icon: Hammer, module: "karagir" },
    ]
  },
  {
    group: "nav.group.stock",
    items: [
      { label: "nav.goldInventory", path: "/inventory/gold", icon: Coins, module: "inventory" },
      { label: "nav.silverInventory", path: "/inventory/silver", icon: Gem, module: "inventory" },
      { label: "nav.suppliers", path: "/suppliers", icon: Truck, module: "suppliers" },
      {
        label: "nav.purchase",
        path: "/purchase/management",
        icon: ShoppingBag,
        module: "purchase",
      },
    ]
  },
  {
    group: "nav.group.config",
    items: [
      { label: "nav.rates", path: "/rates", icon: Percent, module: "rates" },
      { label: "nav.master", path: "/master", icon: SlidersHorizontal, module: "master" },
      { label: "nav.settings", path: "/settings", icon: SettingsIcon, module: "settings" },
      { label: "nav.admin", path: "/admin", icon: Shield, module: "admin" },
      { label: "nav.data", path: "/data", icon: Database, module: "data" },
      { label: "nav.workflow", path: "/workflow", icon: BookOpen, module: "admin" },
    ]
  },
];

// Map routes to human readable titles for breadcrumb header
const ROUTE_TITLES = {
  "/": { section: "Overview", title: "Dashboard" },
  "/billing": { section: "Billing & Sales", title: "New Invoice" },
  "/bills": { section: "Billing & Sales", title: "Bill History" },
  "/customers": { section: "CRM", title: "Customers" },
  "/orders": { section: "Operations", title: "Customer Orders" },
  "/karagir": { section: "Workshop", title: "Karagir Management" },
  "/inventory/gold": { section: "Inventory", title: "Gold Stock" },
  "/inventory/silver": { section: "Inventory", title: "Silver Stock" },
  "/suppliers": { section: "Procurement", title: "Suppliers" },
  "/purchase/add": { section: "Procurement", title: "New Purchase" },
  "/purchase/management": { section: "Procurement", title: "Purchase Management" },
  "/rates": { section: "Configuration", title: "Daily Metal Rates" },
  "/master": { section: "Configuration", title: "Master Catalog" },
  "/settings": { section: "System", title: "Store Settings" },
  "/admin": { section: "System", title: "User & Role Admin" },
  "/data": { section: "System", title: "Data Management" },
  "/workflow": { section: "Help & Docs", title: "Workflow Guide" },
};

export default function Layout() {
  const { user, logout, activeShop } = useAuth();
  const { canAny, can, role } = usePermission();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  const breadcrumb = useMemo(() => {
    if (ROUTE_TITLES[location.pathname]) {
      return ROUTE_TITLES[location.pathname];
    }
    if (location.pathname.startsWith("/customers/")) {
      return { section: "CRM", title: "Customer Profile" };
    }
    return { section: "JewelCore", title: "Store Management" };
  }, [location.pathname]);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300 select-none">
      {/* Brand Identity */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 shadow-md shadow-amber-500/20 ring-1 ring-amber-300/40 shrink-0">
          <Coins className="w-5 h-5 text-slate-950 stroke-[2.2]" />
          <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500 border-2 border-slate-950"></span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-base font-bold text-white tracking-tight">JewelCore</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">ERP</span>
          </div>
          <p className="text-[11px] text-slate-400 truncate tracking-wide font-medium">Enterprise Jewellery Suite</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-slate-800">
        {NAV.map((section) => {
          const visible = section.items.filter((it) => canAny(it.module));
          if (!visible.length) return null;
          return (
            <div key={section.group} className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400/80">
                {t(section.group)}
              </p>
              <div className="space-y-0.5 pt-1">
                {visible.map((it) => {
                  if (it.children) {
                    const parentActive = location.pathname.startsWith(it.path);
                    const Icon = it.icon;
                    const visibleChildren = it.children.filter((child) => canAny(child.module));
                    if (!visibleChildren.length) return null;
                    return (
                      <div key={it.path} className="space-y-0.5">
                        <div className={`flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                          parentActive ? "text-amber-400 bg-slate-900/80" : "text-slate-400 hover:text-slate-200"
                        }`}>
                          <Icon className="w-4 h-4 shrink-0" />
                          <span>{t(it.label)}</span>
                        </div>
                        <div className="ml-4 pl-3 border-l border-slate-800/80 space-y-0.5">
                          {visibleChildren.map((child) => {
                            const childActive = location.pathname === child.path;
                            const ChildIcon = child.icon;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                  childActive
                                    ? "bg-amber-500/15 text-amber-300 font-semibold border-l-2 border-amber-500 pl-2.5"
                                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                                }`}
                              >
                                <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>{t(child.label)}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }
                  const active = location.pathname === it.path;
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.path}
                      to={it.path}
                      onClick={() => setOpen(false)}
                      className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        active
                          ? "bg-amber-500/15 text-amber-300 font-semibold shadow-inner border-l-2 border-amber-500 pl-2.5"
                          : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-amber-400" : "text-slate-400 group-hover:text-slate-200"}`} />
                        <span>{t(it.label)}</span>
                      </div>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User Info & Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950">
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800/80">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-slate-950 font-bold text-xs shrink-0 shadow-xs">
            {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate leading-tight">
              {user?.full_name || user?.email?.split("@")[0]}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium uppercase tracking-wider ${
                role === "admin"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  : role === "cashier"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : "bg-slate-700/50 text-slate-300 border border-slate-600"
              }`}>
                {role}
              </span>
              {activeShop?.shop_name && (
                <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                  · {activeShop.shop_name}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
            title={t("nav.logout")}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 z-30 shadow-xl border-r border-slate-800/70">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity" onClick={() => setOpen(false)} />
          <aside className="relative w-72 h-full bg-slate-950 shadow-2xl animate-in slide-in-from-left duration-200">
            <button
              className="absolute top-4 right-3 z-10 p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main App Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Persistent Offline / Connection Safety Guard Banner */}
        <OfflineStatusBanner />

        {/* Top Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-3 sm:px-6 py-2.5 bg-card/95 backdrop-blur-md border-b border-border/80 gap-3 shadow-2xs">
          {/* Left Context: Mobile trigger + Breadcrumb */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-border/70 hover:bg-muted text-foreground transition-colors"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-muted-foreground/80">{breadcrumb.section}</span>
              <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
              <span className="font-semibold text-foreground tracking-tight">{breadcrumb.title}</span>
            </div>
            <div className="sm:hidden font-semibold text-xs text-foreground truncate max-w-[95px]">
              {breadcrumb.title}
            </div>
          </div>

          {/* Right Actions & Utilities */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Quick New Bill Action for fast store operations */}
            {can("billing", "create") && location.pathname !== "/billing" && (
              <button
                onClick={() => navigate("/billing")}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 shadow-xs hover:shadow transition-all"
                title="Create New Jewellery Bill"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>+ New Bill</span>
              </button>
            )}

            {/* Live Connection Pulse Indicator */}
            <ConnectionIndicator />

            {/* Shop Switcher */}
            <ShopSwitcher />

            <div className="h-4 w-px bg-border/80 hidden sm:block" />

            {/* Utility Controls */}
            <PWAInstallButton />
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background pb-24 sm:pb-12">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Voice Assistant */}
      <VoiceAssistant />
    </div>
  );
}