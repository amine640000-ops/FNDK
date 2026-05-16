import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Menu, X, type LucideIcon } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { FndkLogo } from "@/components/brand-mark";

type SidebarNavProps = {
  items: Array<{
    to: string;
    label: string;
    icon: LucideIcon;
  }>;
  title: string;
  kicker: string;
  footerAction?: ReactNode;
};

export function SidebarNav({ items, title, kicker, footerAction }: SidebarNavProps) {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <aside className="h-fit lg:sticky lg:top-6">
      <div className="glass-panel flex items-center justify-between gap-4 p-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-2">
            <FndkLogo className="h-full w-full" />
          </span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">{kicker}</p>
            <h1 className="mt-2 truncate text-xl font-bold text-white">{title}</h1>
          </div>
        </div>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-200"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close admin menu"
            className="absolute inset-0 bg-[#020223]/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="absolute inset-x-4 top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(12,14,96,0.98)_0%,rgba(7,9,79,0.99)_38%,rgba(4,8,58,1)_100%)] p-4 shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-2">
                  <FndkLogo className="h-full w-full" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">{kicker}</p>
                  <h1 className="mt-2 truncate text-xl font-bold text-white">{title}</h1>
                </div>
              </div>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-200"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-amber-300/10 p-5">
                <p className="text-sm text-slate-300">AI-guided capital management with VIP automation.</p>
              </div>

              <nav className="space-y-2">
                {items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                        isActive
                          ? "bg-cyan-400/15 text-white ring-1 ring-cyan-300/30"
                          : "text-slate-300 hover:bg-white/5 hover:text-white"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
              {footerAction ? <div className="border-t border-white/10 pt-4">{footerAction}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="glass-panel hidden p-4 lg:block">
        <div className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-amber-300/10 p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-2">
              <FndkLogo className="h-full w-full" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-200">{kicker}</p>
              <h1 className="mt-2 text-2xl font-bold text-white">{title}</h1>
            </div>
          </div>
          <p className="text-sm text-slate-300">AI-guided capital management with VIP automation.</p>
        </div>

        <nav className="space-y-2">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                  isActive
                    ? "bg-cyan-400/15 text-white ring-1 ring-cyan-300/30"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        {footerAction ? <div className="border-t border-white/10 pt-4">{footerAction}</div> : null}
      </div>
    </aside>
  );
}
