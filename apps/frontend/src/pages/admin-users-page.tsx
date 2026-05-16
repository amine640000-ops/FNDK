import { SectionCard } from "@/components/section-card";

const users: string[][] = [];

export function AdminUsersPage() {
  return (
    <SectionCard title="User Management" subtitle="User state, VIP tier, and KYC status controls.">
      <div className="hide-scrollbar overflow-x-auto rounded-[24px]">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="pb-3">Name</th>
              <th className="pb-3">Email</th>
              <th className="pb-3">VIP</th>
              <th className="pb-3">KYC</th>
              <th className="pb-3">Joined</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody className="text-white">
            {users.length ? (
              users.map((user) => (
                <tr key={user[1]} className="border-t border-white/10">
                  <td className="py-4">{user[0]}</td>
                  <td className="py-4">{user[1]}</td>
                  <td className="py-4">{user[2]}</td>
                  <td className="py-4 capitalize">{user[3]}</td>
                  <td className="py-4">{user[4]}</td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-full border border-white/10 px-3 py-1.5">View</button>
                      <button className="rounded-full border border-white/10 px-3 py-1.5">Adjust Balance</button>
                      <button className="rounded-full border border-white/10 px-3 py-1.5">Suspend</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr className="border-t border-white/10">
                <td className="py-6 text-slate-400" colSpan={6}>
                  No users loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
