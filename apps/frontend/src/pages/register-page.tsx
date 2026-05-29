import { useState } from "react";
import { Eye, Headphones, Languages, Loader2, ShieldQuestion } from "lucide-react";
import toast from "react-hot-toast";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { axios, identityApi } from "@/api/client";
import { FndkLogo } from "@/components/brand-mark";
import { applyLanguagePreference, getNextLanguage, translateText, useAppLanguage } from "@/lib/i18n";

type RegisterResponse = {
  message: string;
  userId: string;
  referralCode: string;
  emailVerificationSent: boolean;
};

const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const internationalPhonePattern = /^\+[1-9]\d{7,14}$/;

const resolveApiErrorMessage = (error: unknown, fallback: string) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : fallback;
  }

  if (!error.response) {
    return "Identity service is unreachable. Check the API URL and service status.";
  }

  const responseData = error.response.data;
  const responseMessage =
    typeof responseData === "object" && responseData !== null
      ? (responseData as { message?: unknown }).message
      : undefined;

  if (typeof responseMessage === "string") {
    return responseMessage;
  }

  if (Array.isArray(responseMessage)) {
    return responseMessage.filter((message): message is string => typeof message === "string").join(". ");
  }

  if (typeof responseData === "string" && /<html|<!doctype/i.test(responseData)) {
    return "Identity service returned the web app instead of the API. Check VITE_IDENTITY_API_URL.";
  }

  return fallback;
};

const isRegisterResponse = (value: unknown): value is RegisterResponse =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as RegisterResponse).message === "string" &&
  typeof (value as RegisterResponse).userId === "string" &&
  typeof (value as RegisterResponse).referralCode === "string" &&
  typeof (value as RegisterResponse).emailVerificationSent === "boolean";

export function RegisterPage() {
  const navigate = useNavigate();
  const language = useAppLanguage();
  const tt = (text: string) => translateText(language, text);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);
  const [verificationDeliveryFailed, setVerificationDeliveryFailed] = useState(false);
  const [formError, setFormError] = useState("");
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") ?? "");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim().replace(/[^\d+]/g, "");
    const trimmedFullName = fullName.trim();

    if (!internationalPhonePattern.test(normalizedPhone)) {
      const message = tt("Enter a valid phone number with country code, for example +21656109879.");
      setFormError(message);
      toast.error(message);
      return;
    }

    if (!strongPasswordPattern.test(password)) {
      const message = tt("Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.");
      setFormError(message);
      toast.error(message);
      return;
    }

    setLoading(true);

    try {
      const response = await identityApi.post<RegisterResponse>("/auth/register", {
        fullName: trimmedFullName,
        phone: normalizedPhone,
        email: normalizedEmail,
        password,
        ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {})
      });

      if (!isRegisterResponse(response.data)) {
        const message = tt("Registration service returned an invalid response. Check VITE_IDENTITY_API_URL.");
        setFormError(message);
        toast.error(message);
        return;
      }

      setVerificationEmail(normalizedEmail);
      setVerificationDeliveryFailed(!response.data.emailVerificationSent);
      setAwaitingEmailVerification(true);
      if (response.data.emailVerificationSent) {
        toast.success(tt("Account created. Check your email code."));
      } else {
        toast(response.data.message);
      }
    } catch (error) {
      const message = resolveApiErrorMessage(error, tt("Registration failed. Check your referral code and input values."));
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetEmail = verificationEmail || email.trim().toLowerCase();

    if (!targetEmail) {
      toast.error(tt("Enter your email first."));
      return;
    }

    if (verificationCode.trim().length < 4) {
      toast.error(tt("Enter the email verification code."));
      return;
    }

    setVerificationLoading(true);
    try {
      await identityApi.post("/auth/verify-email", {
        email: targetEmail,
        code: verificationCode.trim()
      });
      toast.success(tt("Email verified. You can sign in now."));
      navigate("/login");
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, tt("Could not verify email code.")));
    } finally {
      setVerificationLoading(false);
    }
  };

  const resendVerificationCode = async () => {
    const targetEmail = verificationEmail || email.trim().toLowerCase();
    if (!targetEmail) {
      toast.error(tt("Enter your email first."));
      return;
    }

    setResendingVerification(true);
    try {
      const response = await identityApi.post<{ message: string; emailVerificationSent: boolean }>(
        "/auth/resend-email-verification",
        { email: targetEmail }
      );
      setVerificationDeliveryFailed(!response.data.emailVerificationSent);
      if (response.data.emailVerificationSent) {
        toast.success(tt("Verification code sent."));
      } else {
        toast(response.data.message);
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, tt("Could not resend verification code.")));
    } finally {
      setResendingVerification(false);
    }
  };

  const renderFormError = () =>
    formError ? (
      <div className="rounded-[8px] border border-red-300/25 bg-red-500/10 px-4 py-3 text-sm font-semibold leading-6 text-red-100" role="alert">
        {formError}
      </div>
    ) : null;

  const renderVerificationForm = () => (
    <form className="mt-10 space-y-6" onSubmit={handleVerifyEmail}>
      <div className="fndk-info-panel px-4 py-3.5 text-sm font-semibold leading-6 text-cyan-100">
        {verificationDeliveryFailed
          ? tt("The account was created, but the verification email was not sent. Use Resend code after checking the email delivery settings.")
          : tt("Enter the 6-digit code sent to ")}
        {!verificationDeliveryFailed ? <span className="font-extrabold text-white">{verificationEmail || email}</span> : null}
        {!verificationDeliveryFailed ? "." : null}
      </div>
      <input
        className="fndk-auth-input text-center text-2xl tracking-[0.32em]"
        inputMode="numeric"
        maxLength={8}
        placeholder="000000"
        value={verificationCode}
        onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
        required
      />
      <button
        className="fndk-primary-action flex w-full items-center justify-center gap-2 disabled:opacity-60"
        disabled={verificationLoading}
        type="submit"
      >
        {verificationLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {tt("Verify Email")}
          </>
        ) : (
          tt("Verify Email")
        )}
      </button>
      <button
        className="fndk-secondary-action w-full disabled:opacity-60"
        disabled={resendingVerification}
        onClick={() => void resendVerificationCode()}
        type="button"
      >
        {resendingVerification ? tt("Sending Code...") : tt("Resend Code")}
      </button>
    </form>
  );

  const toggleLanguage = () => {
    const nextLanguage = getNextLanguage(language);
    applyLanguagePreference(nextLanguage);
    toast.success(translateText(nextLanguage, nextLanguage === "fr" ? "Language set to Francais." : nextLanguage === "ar" ? "Language set to Arabic." : "Language set to English."));
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
                aria-label={tt("Help")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-cyan-300 transition hover:bg-cyan-300/10"
                type="button"
              >
                <ShieldQuestion className="h-6 w-6" />
              </button>
              <button
                aria-label={tt("Language")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-cyan-300 transition hover:bg-cyan-300/10"
                onClick={toggleLanguage}
                type="button"
              >
                <Languages className="h-6 w-6" />
              </button>
              <button
                aria-label={tt("Support")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-cyan-300 transition hover:bg-cyan-300/10"
                type="button"
              >
                <Headphones className="h-6 w-6" />
              </button>
            </div>
          </header>

          <main className="relative z-10 flex-1 pt-12">
            <h1 className="text-[2.05rem] font-extrabold tracking-[-0.02em] text-white">
              {awaitingEmailVerification ? tt("Verify Email") : tt("Register")}
            </h1>

            {awaitingEmailVerification ? (
              renderVerificationForm()
            ) : (
              <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
                {renderFormError()}
                <input
                  className="fndk-auth-input"
                  autoComplete="name"
                  placeholder={tt("Full name")}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
                <input
                  className="fndk-auth-input"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder={tt("Phone number")}
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
                <input
                  className="fndk-auth-input"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={tt("Email")}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <span className="relative block">
                  <input
                    className="fndk-auth-input pr-14"
                    autoComplete="new-password"
                    minLength={8}
                    placeholder={tt("Password")}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button
                    aria-label={showPassword ? tt("Hide password") : tt("Show password")}
                    className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-white/85 transition hover:bg-white/5"
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                </span>
                <input
                  className="fndk-auth-input"
                  placeholder={tt("Referral code")}
                  value={referralCode}
                  onChange={(event) => setReferralCode(event.target.value)}
                />

                <button
                  className="fndk-primary-action mt-6 flex w-full items-center justify-center gap-2 disabled:opacity-60"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {tt("Register")}
                    </>
                  ) : (
                    tt("Register")
                  )}
                </button>
              </form>
            )}

            <div className="mt-8 text-center text-[1rem] font-extrabold">
              <span className="text-white">{tt("Already Have Account?")} </span>
              <Link className="text-cyan-300" to="/login">
                {tt("Login Now")}
              </Link>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
