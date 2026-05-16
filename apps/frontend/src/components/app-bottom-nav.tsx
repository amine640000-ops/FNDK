import { House, Sparkles, UserRound, UsersRound, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/app", label: "Home", icon: House },
  { to: "/app/wallet", label: "Assets", icon: WalletCards },
  { to: "/app/mission", label: "Mission", icon: Sparkles },
  { to: "/app/referrals", label: "Team", icon: UsersRound },
  { to: "/app/profile", label: "My Profile", icon: UserRound }
];

export function AppBottomNav() {
  return (
    <div className="bottom-nav-glow z-20 border-t border-white/10 px-3 pb-4 pt-3">
      <nav className="grid grid-cols-5 gap-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1.5 rounded-[18px] px-1.5 py-2.5 text-[10px] font-medium transition ${
                isActive
                  ? "bg-cyan-400/10 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(110,233,255,0.18)]"
                  : "text-slate-500 hover:text-white"
              }`
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="text-center leading-tight">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
