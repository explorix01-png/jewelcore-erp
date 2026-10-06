import React from "react";
import { WifiOff, RotateCcw } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export function OfflineStatusBanner() {
  const { isFullyConnected, isOnline, checking, checkConnection } = useOnlineStatus();

  if (isFullyConnected) return null;

  return (
    <div
      role="alert"
      className="bg-amber-600 text-white px-4 py-2 text-xs font-medium shadow-md transition-all animate-in slide-in-from-top duration-300"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-bold">
              {!isOnline ? "No Internet Connection" : "Backend Server Unreachable"}
            </span>
            <span className="hidden sm:inline mx-1.5 opacity-70">|</span>
            <span className="opacity-90 block sm:inline">
              Financial Safety Lock Active. POS billing, inventory deduction, and purchases require a live database connection to prevent duplicate invoices.
            </span>
          </div>
        </div>

        <button
          onClick={checkConnection}
          disabled={checking}
          className="inline-flex items-center gap-1 px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-white font-semibold transition-colors shrink-0 disabled:opacity-50"
        >
          <RotateCcw className={`w-3 h-3 ${checking ? "animate-spin" : ""}`} />
          <span>{checking ? "Checking..." : "Retry Connection"}</span>
        </button>
      </div>
    </div>
  );
}

export function ConnectionIndicator() {
  const { isFullyConnected, checking, checkConnection } = useOnlineStatus();

  return (
    <button
      onClick={checkConnection}
      title={isFullyConnected ? "Live PostgreSQL Backend Connected" : "Connection Offline / Unreachable — Click to retry"}
      className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors hover:bg-muted/50"
    >
      <span className="relative flex h-2 w-2">
        {isFullyConnected ? (
          <>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </>
        ) : (
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        )}
      </span>
      <span className={`font-mono text-[10px] ${isFullyConnected ? "text-emerald-700" : "text-red-700 font-bold"}`}>
        {checking ? "Probing..." : isFullyConnected ? "Online" : "Offline"}
      </span>
    </button>
  );
}
