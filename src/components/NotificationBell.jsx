import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Bell } from "lucide-react";

export default function NotificationBell() {
  const t = useT();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const load = async () => {
      try {
        const all = await base44.entities.Notification.list("-created_date", 20);
        setNotifications(all);
      } catch (e) { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unread = notifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    for (const n of notifications.filter((n) => !n.is_read)) {
      await base44.entities.Notification.update(n.id, { is_read: true, read_date: new Date().toISOString() }).catch(() => {});
    }
    setNotifications(notifications.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative p-1.5 rounded-md hover:bg-muted">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border bg-popover shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-sm font-semibold">{t("notifications.title")}</span>
            {unread > 0 && <button onClick={markAllRead} className="text-xs text-amber-700 hover:underline">{t("notifications.markAllRead")}</button>}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">{t("notifications.noNotifications")}</p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div key={n.id} className={`px-4 py-3 ${n.is_read ? "opacity-60" : "bg-amber-50/40"}`}>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_date).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}