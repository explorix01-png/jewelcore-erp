import React, { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePermission } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationBell from "@/components/NotificationBell";
import VoiceAssistant from "@/components/voice/VoiceAssistant";
import ShopSwitcher from "@/components/ShopSwitcher";
import PWAInstallButton from "@/components/PWAInstallButton";
import {
  LayoutDashboard, Receipt, History, Package, Users, Truck, ShoppingBag,
  ClipboardList, Hammer, Shield, Database, Percent, Settings as SettingsIcon, SlidersHorizontal,
  LogOut, Menu, X, Coins, BookOpen, Plus,
} from "lucide-react";

const NAV = [
  { group: "nav.group.overview", items: [
    { label: "nav.dashboard", path: "/", icon: LayoutDashboard, module: "dashboard" },
  ]},
  { group: "nav.group.sales", items: [
    { label: "nav.billing", path: "/billing", icon: Receipt, module: "billing" },
    { label: "nav.bills", path: "/bills", icon: History, module: "bills" },
    { label: "nav.customers", path: "/customers", icon: Users, module: "customers" },
    { label: "nav.orders", path: "/orders", icon: ClipboardList, module: "orders" },
    { label: "nav.karagir", path: "/karagir", icon: Hammer, module: "karagir" },
  ]},
  { group: "nav.group.stock", items: [
    { label: "nav.goldInventory", path: "/inventory/gold", icon: Package, module: "inventory" },
    { label: "nav.silverInventory", path: "/inventory/silver", icon: Package, module: "inventory" },
    { label: "nav.suppliers", path: "/suppliers", icon: Truck, module: "suppliers" },
    { label: "nav.purchase", path: "/purchase", icon: ShoppingBag, module: "purchase", children: [
      { label: "nav.addPurchase", path: "/purchase/add", icon: Plus, module: "purchase" },
      { label: "nav.purchaseManagement", path: "/purchase/management", icon: ClipboardList, module: "purchase" },
    ]},
  ]},
  { group: "nav.group.config", items: [
    { label: "nav.rates", path: "/rates", icon: Percent, module: "rates" },
    { label: "nav.master", path: "/master", icon: SlidersHorizontal, module: "master" },
    { label: "nav.settings", path: "/settings", icon: SettingsIcon, module: "settings" },
    { label: "nav.admin", path: "/admin", icon: Shield, module: "admin" },
    { label: "nav.data", path: "/data", icon: Database, module: "data" },
    { label: "nav.workflow", path: "/workflow", icon: BookOpen, module: "admin" },
  ]},
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { canAny, role } = usePermission();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
  };

  // JSX variable (not a component) — prevents full sidebar remount on every
  // Layout re-render (which happens on every route change via useLocation).
  // A new function component type each render would unmount/remount the tree;
  // a JSX variable lets React reconcile in place.
  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-sm">
          <Coins className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-display text-sm font-semibold text-sidebar-primary leading-tight">JewelERP</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("nav.tagline")}</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV.map((section) => {
          const visible = section.items.filter((it) => canAny(it.module));
          if (!visible.length) return null;
          return (
            <div key={section.group}>
              <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{t(section.group)}</p>
              <div className="space-y-0.5">
                {visible.map((it) => {
                  if (it.children) {
                    const parentActive = location.pathname.startsWith(it.path);
                    const Icon = it.icon;
                    const visibleChildren = it.children.filter((child) => canAny(child.module));
                    if (!visibleChildren.length) return null;
                    return (
                      <div key={it.path}>
                        <div className={`flex items-center gap-3 px-3 py-2 text-sm ${parentActive ? "text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80"}`}>
                          <Icon className="w-4 h-4 shrink-0" />
                          {t(it.label)}
                        </div>
                        <div className="ml-4 pl-3 border-l border-sidebar-border space-y-0.5">
                          {visibleChildren.map((child) => {
                            const childActive = location.pathname === child.path;
                            const ChildIcon = child.icon;
                            return (
                              <Link
                                key={child.path}
                                to={child.path}
                                onClick={() => setOpen(false)}
                                className={`flex items-center gap-3 px-3 py-1.5 rounded-md text-sm transition-colors ${
                                  childActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
                                }`}
                              >
                                <ChildIcon className="w-3.5 h-3.5 shrink-0" />
                                {t(child.label)}
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
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {t(it.label)}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-accent-foreground">
            {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate text-sidebar-foreground">{user?.full_name || user?.email}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{role}</p>
          </div>
          <button onClick={handleLogout} className="p-1.5 rounded-md hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground" title={t("nav.logout")}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden lg:flex w-64 shrink-0 bg-sidebar border-r border-sidebar-border">
        {sidebarContent}
      </aside>

      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative w-64 h-full bg-sidebar">
            <button className="absolute top-3 right-3 z-10 p-1.5 rounded-md hover:bg-sidebar-accent" onClick={() => setOpen(false)}>
              <X className="w-4 h-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b bg-background gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button onClick={() => setOpen(true)} className="lg:hidden p-1 rounded hover:bg-muted"><Menu className="w-5 h-5" /></button>
            <span className="font-display font-semibold text-sm hidden sm:block shrink-0">JewelERP</span>
            <ShopSwitcher />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <PWAInstallButton />
            <NotificationBell />
            <LanguageSwitcher />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
      <VoiceAssistant />
    </div>
  );
}