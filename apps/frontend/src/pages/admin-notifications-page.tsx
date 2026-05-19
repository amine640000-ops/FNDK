import { useState } from "react";
import toast from "react-hot-toast";
import { adminApi, getApiErrorMessage, notificationApi } from "@/api/client";
import { SectionCard } from "@/components/section-card";
import { getAccessToken } from "@/lib/auth";

export function AdminNotificationsPage() {
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [userTitle, setUserTitle] = useState("");
  const [userMessage, setUserMessage] = useState("");
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [sendingUserNotification, setSendingUserNotification] = useState(false);

  const sendBroadcast = async () => {
    if (!getAccessToken()) {
      toast.error("Sign in as admin first.");
      return;
    }

    if (!broadcastTitle.trim() || !broadcastMessage.trim()) {
      toast.error("Enter a broadcast title and message.");
      return;
    }

    setSendingBroadcast(true);
    try {
      const response = await adminApi.post<{ audience: string }>("/admin/notifications/broadcast", {
        title: broadcastTitle.trim(),
        message: broadcastMessage.trim()
      });
      setBroadcastTitle("");
      setBroadcastMessage("");
      toast.success(`Broadcast queued for ${response.data.audience}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send broadcast."));
    } finally {
      setSendingBroadcast(false);
    }
  };

  const sendUserNotification = async () => {
    if (!getAccessToken()) {
      toast.error("Sign in as admin first.");
      return;
    }

    if (!userId.trim() || !userTitle.trim() || !userMessage.trim()) {
      toast.error("Enter user ID, title, and message.");
      return;
    }

    setSendingUserNotification(true);
    try {
      await notificationApi.post("/notifications/send", {
        userId: userId.trim(),
        title: userTitle.trim(),
        message: userMessage.trim()
      });
      setUserId("");
      setUserTitle("");
      setUserMessage("");
      toast.success("Notification sent.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send notification."));
    } finally {
      setSendingUserNotification(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Broadcast Announcement" subtitle="Push a notice to all users via socket and email.">
        <div className="grid gap-3">
          <input
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Title"
            value={broadcastTitle}
            onChange={(event) => setBroadcastTitle(event.target.value)}
          />
          <textarea
            className="min-h-40 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Announcement"
            value={broadcastMessage}
            onChange={(event) => setBroadcastMessage(event.target.value)}
          />
          <button
            className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 disabled:opacity-60"
            disabled={sendingBroadcast}
            onClick={() => void sendBroadcast()}
            type="button"
          >
            {sendingBroadcast ? "Sending..." : "Send Broadcast"}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="Per-user Notification" subtitle="Target a specific user with operational updates.">
        <div className="grid gap-3">
          <input
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="User ID"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          />
          <input
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Title"
            value={userTitle}
            onChange={(event) => setUserTitle(event.target.value)}
          />
          <textarea
            className="min-h-40 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Message"
            value={userMessage}
            onChange={(event) => setUserMessage(event.target.value)}
          />
          <button
            className="rounded-2xl border border-white/10 px-4 py-3 disabled:opacity-60"
            disabled={sendingUserNotification}
            onClick={() => void sendUserNotification()}
            type="button"
          >
            {sendingUserNotification ? "Sending..." : "Send Notification"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
