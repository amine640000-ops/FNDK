import { House, Lightbulb, UserRound, UsersRound, WalletCards } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/app", label: "Home", icon: House },
  { to: "/app/wallet", label: "Assets", icon: WalletCards },
  { to: "/app/strategy", label: "Strategy", icon: Lightbulb },
  { to: "/app/referrals", label: "Team", icon: UsersRound },
  { to: "/app/profile", label: "My Profile", icon: UserRound }
];

export function AppBottomNav() {
  return (
    <div className="bottom-nav-glow relative z-20 shrink-0 border-t border-cyan-300/15 px-3 pb-[calc(0.85rem+env(safe-area-inset-bottom))] pt-2.5">
      <nav className="grid grid-cols-5 gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-[10px] px-1 py-1.5 text-[11px] font-semibold transition ${
                isActive
                  ? "text-cyan-300"
                  : "text-[#7d84bd] hover:text-white"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={`h-6 w-6 ${isActive ? "drop-shadow-[0_0_10px_rgba(103,232,255,0.65)]" : ""}`} />
                <span className="text-center leading-tight">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
