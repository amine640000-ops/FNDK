import { SectionCard } from "@/components/section-card";

export function AdminNotificationsPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SectionCard title="Broadcast Announcement" subtitle="Push a notice to all users via socket and email.">
        <div className="grid gap-3">
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3" placeholder="Title" />
          <textarea
            className="min-h-40 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Announcement"
          />
          <button className="rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950">Send Broadcast</button>
        </div>
      </SectionCard>

      <SectionCard title="Per-user Notification" subtitle="Target a specific user with operational updates.">
        <div className="grid gap-3">
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3" placeholder="User ID" />
          <input className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3" placeholder="Title" />
          <textarea
            className="min-h-40 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
            placeholder="Message"
          />
          <button className="rounded-2xl border border-white/10 px-4 py-3">Send Notification</button>
        </div>
      </SectionCard>
    </div>
  );
}

