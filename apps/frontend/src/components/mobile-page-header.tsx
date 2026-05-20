import { ChevronLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession } from "@/lib/auth";

type MobilePageHeaderProps = {
  title: string;
  subtitle?: string;
};

export function MobilePageHeader({ title, subtitle }: MobilePageHeaderProps) {
  const navigate = useNavigate();
  const handleLogout = () => {
    clearAuthSession();
    navigate("/login");
  };

  return (
    <header className="relative z-10 border-b border-cyan-300/15 bg-[#050747]/95 px-4 py-3.5 shadow-[0_1px_0_rgba(117,236,255,0.08)] backdrop-blur-md">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-cyan-300/10 hover:text-cyan-100"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="text-center">
          <div className="text-[1.35rem] font-extrabold tracking-[-0.02em] text-white">{title}</div>
          {subtitle ? <div className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-slate-400">{subtitle}</div> : null}
        </div>
        <button
          aria-label="Sign out"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition hover:bg-cyan-300/10 hover:text-cyan-100"
          onClick={handleLogout}
          type="button"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
