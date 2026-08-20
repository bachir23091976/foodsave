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
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative text-2xl"
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="p-4 text-sm text-gray-500">Aucune notification</p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.isRead && handleMarkAsRead(n.id)}
              className={`p-3 border-b border-gray-100 text-sm cursor-pointer ${
                n.isRead ? "text-gray-400" : "text-gray-800 font-medium bg-green-50"
              }`}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}