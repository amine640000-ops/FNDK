import { useState } from "react";
import { Eye, Headphones, Loader2, Mail, Phone, ShieldQuestion } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { axios, getApiErrorMessage, identityApi } from "@/api/client";
import { FndkLogo } from "@/components/brand-mark";
import { saveAuthSession } from "@/lib/auth";

type LoginMode = "phone" | "email";

export function LoginPage() {
  const navigate = useNavigate();
  const [loginMode, setLoginMode] = useState<LoginMode>("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [rememberAccount, setRememberAccount] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await identityApi.post("/auth/login", {
        email: identifier.trim(),
        password
      });
      saveAuthSession(response.data);
      toast.success("Login successful");
      navigate(response.data.user.role === "ADMIN" ? "/admin" : "/app");
    } catch (error) {
      if (axios.isAxiosError(error) && !error.response) {
        toast.error("Login service is unreachable. Check the identity API status.");
      } else {
        toast.error(getApiErrorMessage(error, "Login failed. Check your credentials."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fndk-auth-bg min-h-screen text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col sm:px-5 sm:py-6 lg:max-w-[520px]">
        <div className="fndk-device-shell flex min-h-screen flex-1 flex-col px-7 pb-8 pt-7 sm:min-h-[860px] sm:rounded-[42px] sm:px-9">
          <header className="relative z-10 flex items-center justify-between border-b border-cyan-200/20 pb-6">
            <div className="flex items-center gap-2.5">
              <FndkLogo className="h-8 w-8 text-cyan-300 drop-shadow-[0_0_12px_rgba(84,239,255,0.45)]" />
              <span className="text-[1.45rem] font-extrabold tracking-[0.08em] text-cyan-100">FNDK</span>
            </div>
            <div className="flex items-center gap-4 text-cyan-300">
              <button
                aria-label="Help"
                className="flex h-9 w-9 items-center justify-center rounded-full text-cyan-300 transition hover:bg-cyan-300/10"
                type="button"
              >
                <ShieldQuestion className="h-6 w-6" />
              </button>
              <button
                aria-label="Support"
                className="flex h-9 w-9 items-center justify-center rounded-full text-cyan-300 transition hover:bg-cyan-300/10"
                type="button"
              >
                <Headphones className="h-6 w-6" />
              </button>
            </div>
          </header>

          <main className="relative z-10 flex-1 pt-16">
            <h1 className="text-[2.05rem] font-extrabold tracking-[-0.02em] text-white">Login</h1>

            <form className="mt-11 space-y-7" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 items-end gap-4">
                <button
                  className={`relative flex items-center justify-center gap-2 pb-4 text-[1rem] font-bold transition ${
                    loginMode === "phone" ? "text-white" : "text-slate-400"
                  }`}
                  onClick={() => setLoginMode("phone")}
                  type="button"
                >
                  <Phone className="h-4 w-4" />
                  Phone Number
                  {loginMode === "phone" ? (
                    <span className="absolute bottom-0 h-1 w-14 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,255,0.7)]" />
                  ) : null}
                </button>
                <button
                  className={`relative flex items-center justify-center gap-2 pb-4 text-[1rem] font-bold transition ${
                    loginMode === "email" ? "text-white" : "text-slate-400"
                  }`}
                  onClick={() => setLoginMode("email")}
                  type="button"
                >
                  <Mail className="h-4 w-4" />
                  Email
                  {loginMode === "email" ? (
                    <span className="absolute bottom-0 h-1 w-14 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(103,232,255,0.7)]" />
                  ) : null}
                </button>
              </div>

              <label className="block">
                <span className="sr-only">{loginMode === "email" ? "Email" : "Phone number"}</span>
                <input
                  className="fndk-auth-input"
                  autoComplete={loginMode === "email" ? "email" : "tel"}
                  inputMode={loginMode === "email" ? "email" : "tel"}
                  placeholder={loginMode === "email" ? "Enter email" : "Enter phone number"}
                  type={loginMode === "email" ? "email" : "tel"}
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-4 block text-[1.15rem] font-extrabold text-white">Password</span>
                <span className="relative block">
                  <input
                    className="fndk-auth-input pr-14"
                    autoComplete="current-password"
                    minLength={8}
                    placeholder="Enter password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white/85 transition hover:bg-white/5"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                </span>
              </label>

              <div className="flex items-center justify-between gap-4 text-[0.95rem] font-bold">
                <label className="flex min-w-0 cursor-pointer items-center gap-3 text-white">
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border ${
                      rememberAccount
                        ? "border-cyan-300 bg-cyan-300 text-[#03084a]"
                        : "border-[#3042a7] bg-[#080c65]"
                    }`}
                  >
                    {rememberAccount ? <span className="h-2.5 w-2.5 rounded-[3px] bg-[#03084a]" /> : null}
                  </span>
                  <input
                    checked={rememberAccount}
                    className="sr-only"
                    onChange={(event) => setRememberAccount(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="truncate">Remember Account</span>
                </label>
                <Link className="shrink-0 text-cyan-300 transition hover:text-cyan-100" to="/forgot-password">
                  Forgot Password
                </Link>
              </div>

              <button
                className="fndk-primary-action mt-6 flex w-full items-center justify-center gap-2 disabled:opacity-60"
                disabled={loading}
                type="submit"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Login
                  </>
                ) : (
                  "Login"
                )}
              </button>
            </form>

            <div className="mt-8 text-center text-[1rem] font-extrabold">
              <span className="text-white">No Account Yet? </span>
              <Link className="text-cyan-300" to="/register">
                Register Now
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
