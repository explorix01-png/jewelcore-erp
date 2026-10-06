import { useState, useEffect, useCallback } from "react";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [checking, setChecking] = useState(false);

  const checkConnection = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setIsOnline(false);
      setIsServerReachable(false);
      return false;
    }

    setChecking(true);
    try {
      // Small timeout health probe to backend
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch("/api/health", { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeoutId);

      const reachable = res.ok;
      setIsServerReachable(reachable);
      setIsOnline(true);
      return reachable;
    } catch {
      setIsServerReachable(false);
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Initial check
    checkConnection();

    // Periodic heartbeat check every 30 seconds
    const interval = setInterval(checkConnection, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, [checkConnection]);

  return {
    isOnline,
    isServerReachable,
    isFullyConnected: isOnline && isServerReachable,
    checking,
    checkConnection,
  };
}
