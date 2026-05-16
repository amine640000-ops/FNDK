import { ChevronLeft, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

type MobilePageHeaderProps = {
  title: string;
  subtitle?: string;
};

export function MobilePageHeader({ title, subtitle }: MobilePageHeaderProps) {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem("nevo.accessToken");
    localStorage.removeItem("nevo.refreshToken");
    localStorage.removeItem("nevo.user");
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#07084f]/92 px-4 py-3.5 backdrop-blur-md">
      <div className="grid grid-cols-[40px_minmax(0,1fr)_40px] items-center">
        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/5 hover:text-white"
          onClick={() => navigate(-1)}
          type="button"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="text-center">
          <div className="text-[1.45rem] font-semibold tracking-[-0.03em] text-white">{title}</div>
          {subtitle ? <div className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-slate-400">{subtitle}</div> : null}
        </div>
        <button
          aria-label="Sign out"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/5 hover:text-white"
          onClick={handleLogout}
          type="button"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
