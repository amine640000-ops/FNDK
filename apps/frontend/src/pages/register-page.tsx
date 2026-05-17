import { useState } from "react";
import axios from "axios";
import { ArrowRight, BadgeCheck, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BrandMark } from "@/components/brand-mark";

const identityApi = axios.create({
  baseURL: import.meta.env.VITE_IDENTITY_API_URL ?? "http://localhost:4001/api"
});

type RegisterResponse = {
  message: string;
  userId: string;
  referralCode: string;
  emailVerificationSent: boolean;
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") ?? "");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await identityApi.post<RegisterResponse>("/auth/register", {
        fullName,
        phone,
        email: normalizedEmail,
        password,
        ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {})
      });
      setVerificationEmail(normalizedEmail);
      setAwaitingEmailVerification(true);
      toast.success(response.data.emailVerificationSent ? "Account created. Check your email code." : response.data.message);
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data?.message === "string") {
        toast.error(error.response.data.message);
      } else {
        toast.error("Registration failed. Check your referral code and input values.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetEmail = verificationEmail || email.trim().toLowerCase();

    if (!targetEmail) {
      toast.error("Enter your email first.");
      return;
    }

    if (verificationCode.trim().length < 4) {
      toast.error("Enter the email verification code.");
      return;
    }

    setVerificationLoading(true);
    try {
      await identityApi.post("/auth/verify-email", {
        email: targetEmail,
        code: verificationCode.trim()
      });
      toast.success("Email verified. You can sign in now.");
      navigate("/login");
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data?.message === "string") {
        toast.error(error.response.data.message);
      } else {
        toast.error("Could not verify email code.");
      }
    } finally {
      setVerificationLoading(false);
    }
  };

  const resendVerificationCode = async () => {
    const targetEmail = verificationEmail || email.trim().toLowerCase();
    if (!targetEmail) {
      toast.error("Enter your email first.");
      return;
    }

    setResendingVerification(true);
    try {
      const response = await identityApi.post<{ message: string; emailVerificationSent: boolean }>(
        "/auth/resend-email-verification",
        { email: targetEmail }
      );
      toast.success(response.data.emailVerificationSent ? "Verification code sent." : response.data.message);
    } catch (error) {
      if (axios.isAxiosError(error) && typeof error.response?.data?.message === "string") {
        toast.error(error.response.data.message);
      } else {
        toast.error("Could not resend verification code.");
      }
    } finally {
      setResendingVerification(false);
    }
  };

  const renderVerificationForm = (className: string) => (
    <form className={className} onSubmit={handleVerifyEmail}>
      <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 text-sm leading-6 text-cyan-100">
        Enter the 6-digit code sent to <span className="font-semibold text-white">{verificationEmail || email}</span>.
      </div>
      <input
        className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-center text-2xl font-semibold tracking-[0.32em] text-white outline-none transition focus:border-cyan-300/40"
        inputMode="numeric"
        maxLength={8}
        placeholder="000000"
        value={verificationCode}
        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
        required
      />
      <button
        className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-cyan-400 px-4 py-4 text-lg font-semibold text-slate-950 disabled:opacity-70"
        disabled={verificationLoading}
        type="submit"
      >
        {verificationLoading ? "Verifying..." : "Verify email"}
        <ArrowRight className="h-5 w-5" />
      </button>
      <button
        className="w-full rounded-[20px] border border-white/10 px-4 py-3 text-center text-sm text-slate-300 disabled:opacity-60"
        disabled={resendingVerification}
        onClick={() => void resendVerificationCode()}
        type="button"
      >
        {resendingVerification ? "Sending code..." : "Resend code"}
      </button>
    </form>
  );

  return (
    <div className="text-white">
      <div className="app-mobile-bg min-h-screen px-4 py-6 lg:hidden">
        <div className="mx-auto flex min-h-screen max-w-[430px] flex-col sm:px-4 sm:py-6">
          <div className="phone-shell flex min-h-screen flex-1 flex-col px-4 pb-6 pt-5 sm:min-h-[880px] sm:rounded-[38px]">
            <BrandMark subtitle="create account" />

            <section className="concept-banner mt-5 px-4 py-5">
              <div className="relative z-10 max-w-[66%]">
                <div className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/80">Investor onboarding</div>
                <h1 className="mt-2 text-[2rem] font-extrabold leading-[1.04] text-[#ffe0a8]">
                  Open your first-line account.
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-200/80">
                  Create an investor profile, attach a referral code if required, and join the reward system.
                </p>
              </div>

              <div className="absolute bottom-4 right-4 z-10 flex h-28 w-28 items-center justify-center rounded-[28px] bg-gradient-to-b from-[#2f63ff] to-[#1533a8] shadow-[0_18px_26px_rgba(0,0,0,0.28)]">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#ffe2a9] to-[#d08a1f] text-[#3d2404] shadow-[0_8px_18px_rgba(228,171,62,0.45)]">
                  <BadgeCheck className="h-8 w-8" />
                </div>
              </div>
            </section>

            <section className="neon-soft-panel mt-5 p-4">
              <div className="text-sm uppercase tracking-[0.26em] text-cyan-200/70">Registration rule</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                The first investor can register without a referral code. After that, every new user needs an existing
                member code before they can join.
              </div>
            </section>

            <section className="neon-panel mt-5 p-5">
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Register</div>
              <div className="mt-2 text-[2rem] font-extrabold text-white">
                {awaitingEmailVerification ? "Verify Email" : "Investor Onboarding"}
              </div>
              {awaitingEmailVerification ? (
                renderVerificationForm("mt-6 space-y-4")
              ) : (
                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Password"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-cyan-300/25 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Referral code"
                    value={referralCode}
                    onChange={(event) => setReferralCode(event.target.value)}
                  />

                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-cyan-400 px-4 py-4 text-lg font-semibold text-slate-950 disabled:opacity-70"
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "Creating account..." : "Create account"}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </form>
              )}

              <div className="mt-4 flex gap-3">
                <Link
                  to="/login"
                  className="flex-1 rounded-[20px] border border-white/10 px-4 py-3 text-center text-sm text-slate-300"
                >
                  Back to login
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="app-mobile-bg hidden min-h-screen px-8 py-8 lg:block">
        <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl grid-cols-[minmax(0,1.15fr)_minmax(420px,520px)] gap-8">
          <section className="relative overflow-hidden rounded-[40px] border border-white/10 bg-[linear-gradient(145deg,rgba(4,8,58,0.96)_0%,rgba(8,16,93,0.92)_55%,rgba(12,31,108,0.9)_100%)] px-10 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.32)]">
            <BrandMark subtitle="create account" />

            <div className="relative z-10 mt-20 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                <BadgeCheck className="h-4 w-4" />
                Investor onboarding
              </div>
              <h1 className="mt-6 text-[4.1rem] font-extrabold leading-[0.94] tracking-[-0.06em] text-white">
                Open your first-line account.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-200/78">
                Create an investor profile, apply a referral code when needed, and enter the reward system with the
                same flow used by the mobile app.
              </p>
            </div>

            <div className="relative z-10 mt-12 grid max-w-2xl gap-4">
              <div className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
                <div className="mt-1 rounded-2xl bg-cyan-300/10 p-2 text-cyan-200">
                  <BadgeCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Referral-aware registration</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    First user registration can proceed without a code, then every next investor follows the referral
                    gate.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-[24px] border border-white/10 bg-white/5 px-5 py-4">
                <div className="mt-1 rounded-2xl bg-cyan-300/10 p-2 text-cyan-200">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Fast desktop onboarding</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">
                    The form is optimized for larger screens without replacing the current phone-first registration
                    experience.
                  </div>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute -right-12 top-24 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
            <div className="pointer-events-none absolute bottom-8 right-10 flex h-40 w-40 items-center justify-center rounded-[36px] bg-gradient-to-b from-[#2f63ff] to-[#1533a8] shadow-[0_24px_50px_rgba(0,0,0,0.32)]">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#ffe2a9] to-[#d08a1f] text-[#3d2404] shadow-[0_12px_22px_rgba(228,171,62,0.45)]">
                <BadgeCheck className="h-10 w-10" />
              </div>
            </div>
          </section>

          <div className="flex items-center">
            <section className="neon-panel w-full p-8">
              <div className="text-sm uppercase tracking-[0.28em] text-cyan-200/70">Register</div>
              <div className="mt-2 text-[2.5rem] font-extrabold text-white">Investor Onboarding</div>
              <div className="mt-3 text-sm leading-6 text-slate-300">
                {awaitingEmailVerification
                  ? "Verify your email before signing in."
                  : "Create a new account and verify your email."}
              </div>

              {awaitingEmailVerification ? (
                renderVerificationForm("mt-8 space-y-4")
              ) : (
                <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Phone"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Password"
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <input
                    className="w-full rounded-[20px] border border-cyan-300/25 bg-[#080b56]/90 px-4 py-4 text-lg text-white outline-none transition focus:border-cyan-300/40"
                    placeholder="Referral code"
                    value={referralCode}
                    onChange={(event) => setReferralCode(event.target.value)}
                  />

                  <button
                    className="flex w-full items-center justify-center gap-2 rounded-[22px] bg-cyan-400 px-4 py-4 text-lg font-semibold text-slate-950 disabled:opacity-70"
                    disabled={loading}
                    type="submit"
                  >
                    {loading ? "Creating account..." : "Create account"}
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </form>
              )}

              <div className="mt-4">
                <Link
                  to="/login"
                  className="block rounded-[20px] border border-white/10 px-4 py-3 text-center text-sm text-slate-300"
                >
                  Back to login
                </Link>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
