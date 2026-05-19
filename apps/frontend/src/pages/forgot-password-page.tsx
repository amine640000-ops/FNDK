import { type FormEvent, useState } from "react";
import { ChevronLeft, Eye, Headphones, KeyRound, Loader2, Mail, ShieldQuestion } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { axios, identityApi } from "@/api/client";
import { FndkLogo } from "@/components/brand-mark";

const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const resetSteps = [
  { id: "request", label: "Email", icon: Mail },
  { id: "reset", label: "Reset Code", icon: KeyRound }
] as const;

const resolveApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  const responseMessage = error.response?.data?.message;
  if (typeof responseMessage === "string") {
    return responseMessage;
  }

  if (Array.isArray(responseMessage)) {
    return responseMessage.filter((message): message is string => typeof message === "string").join(". ");
  }

  return fallback;
};

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"request" | "reset">("request");
  const [requesting, setRequesting] = useState(false);
  const [resetting, setResetting] = useState(false);

  const sendResetCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      toast.error("Enter your email.");
      return;
    }

    setRequesting(true);
    try {
      await identityApi.post("/auth/password-reset/request", { email: normalizedEmail });
      setEmail(normalizedEmail);
      setStep("reset");
      toast.success("If the account exists, a reset code was sent.");
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, "Could not send reset code."));
    } finally {
      setRequesting(false);
    }
  };

  const requestReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendResetCode();
  };

  const confirmReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (code.trim().length < 4) {
      toast.error("Enter the reset code.");
      return;
    }

    if (!strongPasswordPattern.test(password)) {
      toast.error("Password must include uppercase, lowercase, number, and symbol.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setResetting(true);
    try {
      await identityApi.post("/auth/password-reset/confirm", {
        email: normalizedEmail,
        code: code.trim(),
        password
      });
      toast.success("Password reset successful. Login now.");
      navigate("/login");
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, "Could not reset password."));
    } finally {
      setResetting(false);
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

          <main className="relative z-10 flex-1 pt-12">
            <button
              className="mb-8 inline-flex items-center gap-2 text-sm font-extrabold text-cyan-200"
              onClick={() => navigate("/login")}
              type="button"
            >
              <ChevronLeft className="h-5 w-5" />
              Back To Login
            </button>

            <h1 className="text-[2.05rem] font-extrabold tracking-[-0.02em] text-white">Forgot Password</h1>

            <div className="fndk-tab-rail mt-9 grid grid-cols-2 items-end gap-4">
              {resetSteps.map(({ id, label, icon: Icon }) => {
                const active = step === id;

                return (
                  <button
                    key={id}
                    className={`relative flex items-center justify-center gap-2 pb-4 text-[1rem] font-bold transition ${
                      active ? "fndk-tab-active" : "text-slate-400"
                    }`}
                    onClick={() => {
                      if (id === "request") {
                        setStep("request");
                      }
                    }}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                );
              })}
            </div>

            {step === "request" ? (
              <form className="mt-8 space-y-7" onSubmit={requestReset}>
                <label className="block">
                  <span className="mb-4 block text-[1.15rem] font-extrabold text-white">Email</span>
                  <input
                    className="fndk-auth-input"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="Enter email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>

                <button
                  className="fndk-primary-action mt-6 flex w-full items-center justify-center gap-2 disabled:opacity-60"
                  disabled={requesting}
                  type="submit"
                >
                  {requesting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Send Code
                    </>
                  ) : (
                    "Send Code"
                  )}
                </button>
              </form>
            ) : (
              <form className="mt-8 space-y-5" onSubmit={confirmReset}>
                <div className="fndk-info-panel px-4 py-3.5 text-sm font-semibold leading-6 text-cyan-100">
                  Enter the reset code sent to <span className="font-extrabold text-white">{email}</span>.
                </div>

                <label className="block">
                  <span className="mb-3 block text-[1rem] font-extrabold text-white">Reset Code</span>
                  <input
                    className="fndk-auth-input text-center text-2xl tracking-[0.32em]"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="000000"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    required
                  />
                </label>

                <label className="block">
                  <span className="mb-3 block text-[1rem] font-extrabold text-white">New Password</span>
                  <span className="relative block">
                    <input
                      className="fndk-auth-input pr-14"
                      autoComplete="new-password"
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

                <label className="block">
                  <span className="mb-3 block text-[1rem] font-extrabold text-white">Confirm Password</span>
                  <input
                    className="fndk-auth-input"
                    autoComplete="new-password"
                    minLength={8}
                    placeholder="Confirm password"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                  />
                </label>

                <button
                  className="fndk-primary-action mt-6 flex w-full items-center justify-center gap-2 disabled:opacity-60"
                  disabled={resetting}
                  type="submit"
                >
                  {resetting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Reset Password
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>

                <button
                  className="fndk-secondary-action w-full disabled:opacity-60"
                  disabled={requesting}
                  onClick={() => void sendResetCode()}
                  type="button"
                >
                  {requesting ? "Sending Code..." : "Resend Code"}
                </button>
              </form>
            )}

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
