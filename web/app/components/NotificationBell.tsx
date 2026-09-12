"use client";

import { useEffect, useState } from "react";
import { API_URL } from "../lib/api";

interface Notification {
  id: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const loadNotifications = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    fetch(`${API_URL}/notifications`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setNotifications(data.notifications || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (notificationId: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      await fetch(`${API_URL}/notifications/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationId }),
      });

      loadNotifications();
    } catch {
      // Network failure: notification just stays unread until the next
      // successful click or the 15s polling refresh.
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative shrink-0" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-[#ccd6c7] bg-white text-[#215d43] hover:bg-[#edf3e4] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ad6816]"
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notifications-panel"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div id="notifications-panel" className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white border border-[#dce2d8] rounded-2xl shadow-xl z-20 max-h-80 overflow-y-auto text-[#183e32]">
          <p className="px-4 pt-4 pb-2 font-semibold text-sm">Vos notifications</p>
          {notifications.length === 0 && (
            <p className="p-4 text-sm text-gray-500">Aucune notification</p>
          )}
          {notifications.map((n) => (
            <button
              type="button"
              key={n.id}
              onClick={() => !n.isRead && handleMarkAsRead(n.id)}
              className={`block w-full text-left p-4 border-b border-gray-100 text-sm cursor-pointer break-words focus-visible:outline-2 focus-visible:outline-[#215d43] ${
                n.isRead ? "text-[#59685e]" : "text-[#183e32] font-medium bg-[#edf3e4]"
              }`}
            >
              {n.message}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
