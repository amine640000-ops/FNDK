import { useState } from "react";
import axios from "axios";
import { ArrowRight, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";

const identityApi = axios.create({
  baseURL: import.meta.env.VITE_IDENTITY_API_URL ?? "http://localhost:4001/api"
});

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await identityApi.post("/auth/login", { email: email.trim(), password });
      localStorage.setItem("nevo.accessToken", response.data.accessToken);
      localStorage.setItem("nevo.refreshToken", response.data.refreshToken);
      localStorage.setItem("nevo.user", JSON.stringify(response.data.user));
      toast.success("Login successful");
      navigate(response.data.user.role === "ADMIN" ? "/admin" : "/app");
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        toast.error("Login service is unreachable. Check that identity-service is running.");
      } else if (axios.isAxiosError(error) && typeof error.response?.data?.message === "string") {
        toast.error(error.response.data.message);
      } else {
        toast.error("Login failed. Check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-white">
      <div className="app-mobile-bg min-h-screen px-4 py-6 lg:hidden">
        <div className="mx-auto flex min-h-screen max-w-[430px] flex-col sm:px-4 sm:py-6">
          <div className="phone-shell flex min-h-screen flex-1 flex-col px-4 pb-6 pt-5 sm:min-h-[880px] sm:rounded-[38px]">
            <BrandMark subtitle="access portal" />

            <section className="concept-banner mt-5 px-4 py-5">
              <div className="relative z-10 max-w-[64%]">
                <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/80">Direct access</div>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-[1.04] text-[#ffe0a8]">
                  Enter the investor app.
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-200/80">
                  Sign in against the live identity service to access investor and admin areas.
                </p>
              </div>

            </section>

            <section className="neon-panel mt-5 p-5">
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Live login</div>
              <div className="mt-2 text-[2rem] font-extrabold text-white">Account Access</div>
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Username or email</label>
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Username, name, or email"
                    type="text"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Password</label>
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Enter password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-cyan-400 px-4 py-4 text-lg font-semibold text-slate-950 disabled:opacity-70"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Signing in..." : "Sign in"}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </form>

              <div className="mt-4">
                <Link
                  to="/register"
                  className="block rounded-[20px] border border-white/10 px-4 py-3 text-center text-sm text-slate-300"
                >
                  Create account
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="app-mobile-bg hidden min-h-screen px-8 py-8 lg:block">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-[minmax(0,1.15fr)_minmax(420px,480px)] gap-8">
          <section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-[linear-gradient(145deg,rgba(4,8,58,0.96)_0%,rgba(8,16,93,0.92)_55%,rgba(12,31,108,0.9)_100%)] px-10 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.32)]">
            <BrandMark subtitle="access portal" />

            <div className="relative z-10 mt-20 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                <ShieldCheck className="h-4 w-4" />
                Direct access
              </div>
              <h1 className="mt-6 text-[4.2rem] font-extrabold leading-[0.94] tracking-[-0.06em] text-white">
                Enter the investor app.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-200/78">
                Use live credentials to access the investor workspace and the protected admin tools.
              </p>
            </div>

            <div className="relative z-10 mt-12 grid max-w-2xl gap-4">
              <div className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
                <div className="mt-1 rounded-2xl bg-cyan-300/10 p-2 text-cyan-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Live identity login</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    Sign in against the running auth service and route investors and admins automatically.
                  </div>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-12 top-24 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
          </section>

          <div className="flex items-center">
            <section className="neon-panel w-full p-8">
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Live login</div>
              <div className="mt-2 text-[2.5rem] font-extrabold text-white">Account Access</div>
              <div className="mt-3 text-sm leading-6 text-slate-300">
                Sign in with your existing account.
              </div>

              <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Username or email</label>
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Username, name, or email"
                    type="text"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-slate-300">Password</label>
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Enter password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>

                <button
                  className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-cyan-400 px-4 py-4 text-lg font-semibold text-slate-950 disabled:opacity-70"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Signing in..." : "Sign in"}
                  <ArrowRight className="h-5 w-5" />
                </button>
              </form>

              <div className="mt-4">
                <Link
                  to="/register"
                  className="block rounded-[20px] border border-white/10 px-4 py-3 text-center text-sm text-slate-300"
                >
                  Create account
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
