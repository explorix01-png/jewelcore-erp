import React from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, actions, badge }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-border/60">
      <div className="space-y-1">
        {badge && <div className="mb-1">{badge}</div>}
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          {title}
        </h1>
        {subtitle && <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, accent, trend, trendType = "up", onClick }) {
  const cardClasses = cn(
    "relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-sm transition-all duration-200",
    onClick && "cursor-pointer hover:border-amber-400/50 hover:shadow-md hover:-translate-y-0.5"
  );

  return (
    <div className={cardClasses} onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{label}</p>
          <p className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight truncate">{value}</p>
          {(sub || trend) && (
            <div className="flex items-center gap-2 flex-wrap pt-0.5">
              {trend && (
                <span className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded",
                  trendType === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                )}>
                  {trend}
                </span>
              )}
              {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-xs",
            accent || "bg-amber-50 text-amber-700 border border-amber-200/50"
          )}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, description, icon: Icon, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-border/80 bg-card/50">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 mb-4 shadow-xs">
          <Icon className="w-7 h-7" />
        </div>
      )}
      <h3 className="font-display text-base font-semibold text-foreground tracking-tight">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1.5 max-w-sm text-center leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({ children, variant = "default", dot = false, className }) {
  const variants = {
    default: "bg-secondary text-secondary-foreground border-border",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    gold: "bg-amber-500/15 text-amber-800 border-amber-300/60 font-semibold",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };

  const dotColors = {
    default: "bg-muted-foreground",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    info: "bg-blue-500",
    gold: "bg-amber-500",
    purple: "bg-purple-500",
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border shadow-2xs",
      variants[variant] || variants.default,
      className
    )}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant] || dotColors.default)} />}
      {children}
    </span>
  );
}

export function Spinner({ label = "Loading data..." }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="w-8 h-8 border-3 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
    </div>
  );
}

export function TableShell({ headers, children, className }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3.5 whitespace-nowrap font-medium text-foreground/80">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function SearchFilterToolbar({
  search,
  onSearchChange,
  placeholder = "Search...",
  filters,
  actions,
  className
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4", className)}>
      <div className="flex items-center gap-2 flex-1 max-w-md">
        {search !== undefined && (
          <div className="relative w-full">
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        )}
        {filters}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}