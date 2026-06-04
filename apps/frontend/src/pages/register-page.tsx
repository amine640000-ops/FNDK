import { useEffect, useMemo, useRef, useState } from "react";
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from "libphonenumber-js/min";
import { ChevronDown, Eye, Headphones, Languages, Loader2, Search, ShieldQuestion } from "lucide-react";
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
type PhoneCountryCode = ReturnType<typeof getCountries>[number];

const countryNameFormatter = new Intl.DisplayNames(["en"], { type: "region" });
const phoneCountryOptions = getCountries()
  .map((countryCode) => {
    const countryName = countryNameFormatter.of(countryCode) ?? countryCode;
    const dialCode = `+${getCountryCallingCode(countryCode)}`;

    return {
      countryCode,
      countryName,
      dialCode,
      label: `${countryName} (${dialCode})`
    };
  })
  .sort((firstCountry, secondCountry) => firstCountry.countryName.localeCompare(secondCountry.countryName));

const getPhoneDialCode = (countryCode: PhoneCountryCode | "") =>
  phoneCountryOptions.find((countryOption) => countryOption.countryCode === countryCode)?.dialCode ?? "";

const getDialCodeDigits = (countryCode: PhoneCountryCode | "") => getPhoneDialCode(countryCode).replace(/\D/g, "");

const normalizeNationalPhoneInput = (value: string, countryCode: PhoneCountryCode | "") => {
  const trimmedValue = value.trim();
  const dialCodeDigits = getDialCodeDigits(countryCode);
  let phoneDigits = trimmedValue.replace(/\D/g, "");

  if (dialCodeDigits && (trimmedValue.startsWith("+") || trimmedValue.startsWith("00")) && phoneDigits.startsWith(dialCodeDigits)) {
    phoneDigits = phoneDigits.slice(dialCodeDigits.length);
  }

  return phoneDigits;
};

const buildInternationalPhone = (nationalPhone: string, countryCode: PhoneCountryCode | "") => {
  if (!countryCode || !nationalPhone.trim()) {
    return "";
  }

  const parsedPhone = parsePhoneNumberFromString(nationalPhone.trim(), countryCode);
  if (parsedPhone?.isValid()) {
    return parsedPhone.number;
  }

  const selectedDialCode = getPhoneDialCode(countryCode);
  const normalizedPhoneNumber = normalizeNationalPhoneInput(nationalPhone, countryCode);
  return selectedDialCode && normalizedPhoneNumber ? `${selectedDialCode}${normalizedPhoneNumber}` : "";
};

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
  const [phoneCountryCode, setPhoneCountryCode] = useState<PhoneCountryCode | "">("");
  const [phonePickerOpen, setPhonePickerOpen] = useState(false);
  const [phoneCountrySearch, setPhoneCountrySearch] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") ?? "");
  const phonePickerRef = useRef<HTMLDivElement>(null);
  const selectedPhoneCountry = phoneCountryOptions.find((countryOption) => countryOption.countryCode === phoneCountryCode);
  const filteredPhoneCountryOptions = useMemo(() => {
    const searchTerm = phoneCountrySearch.trim().toLowerCase();

    if (!searchTerm) {
      return phoneCountryOptions;
    }

    return phoneCountryOptions.filter(
      (countryOption) =>
        countryOption.countryName.toLowerCase().includes(searchTerm) ||
        countryOption.countryCode.toLowerCase().includes(searchTerm) ||
        countryOption.dialCode.includes(searchTerm)
    );
  }, [phoneCountrySearch]);

  useEffect(() => {
    if (!phonePickerOpen) {
      return undefined;
    }

    const closePickerOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && phonePickerRef.current?.contains(event.target)) {
        return;
      }

      setPhonePickerOpen(false);
    };

    document.addEventListener("mousedown", closePickerOnOutsideClick);
    return () => document.removeEventListener("mousedown", closePickerOnOutsideClick);
  }, [phonePickerOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = buildInternationalPhone(phoneNumber, phoneCountryCode);
    const trimmedFullName = fullName.trim();

    if (!internationalPhonePattern.test(normalizedPhone)) {
      const message = tt("Select a country code and enter a valid phone number.");
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
                <div className="grid gap-3">
                  <div className="relative" ref={phonePickerRef}>
                    <button
                      aria-expanded={phonePickerOpen}
                      aria-label={tt("Country code")}
                      className="fndk-auth-input flex items-center justify-between gap-3 text-left"
                      onClick={() => setPhonePickerOpen((current) => !current)}
                      type="button"
                    >
                      <span className={selectedPhoneCountry ? "min-w-0 truncate text-white" : "min-w-0 truncate text-white/50"}>
                        {selectedPhoneCountry?.label ?? tt("Select country code")}
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-cyan-200 transition ${phonePickerOpen ? "rotate-180" : ""}`} />
                    </button>
                    {phonePickerOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-50 overflow-hidden rounded-[10px] border border-cyan-300/35 bg-[#07105f] shadow-[0_18px_42px_rgba(0,0,0,0.45)]">
                        <div className="relative border-b border-cyan-200/15 p-2">
                          <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-200/75" />
                          <input
                            className="w-full rounded-[8px] border border-cyan-300/25 bg-[#0b1576] py-2.5 pl-11 pr-3 text-sm font-bold text-white outline-none placeholder:text-white/40 focus:border-cyan-200"
                            placeholder={tt("Search country or code")}
                            value={phoneCountrySearch}
                            onChange={(event) => setPhoneCountrySearch(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                              }

                              if (event.key === "Escape") {
                                setPhonePickerOpen(false);
                              }
                            }}
                          />
                        </div>
                        <div className="max-h-56 overflow-y-auto py-1">
                          {filteredPhoneCountryOptions.length ? (
                            filteredPhoneCountryOptions.map((countryOption) => {
                              const isSelected = countryOption.countryCode === phoneCountryCode;

                              return (
                                <button
                                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-bold transition ${
                                    isSelected ? "bg-cyan-300/18 text-cyan-100" : "text-slate-100 hover:bg-cyan-300/10"
                                  }`}
                                  key={countryOption.countryCode}
                                  onClick={() => {
                                    setPhoneCountryCode(countryOption.countryCode);
                                    setPhoneCountrySearch("");
                                    setPhonePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="min-w-0 truncate">{countryOption.countryName}</span>
                                  <span className="shrink-0 text-cyan-200">{countryOption.dialCode}</span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-4 py-3 text-sm font-bold text-slate-300">{tt("No countries found.")}</div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="fndk-auth-input fndk-auth-phone-field flex items-center gap-3 px-3 py-2.5">
                    <span
                      className={`shrink-0 rounded-[8px] border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-sm font-extrabold ${
                        selectedPhoneCountry ? "text-cyan-100" : "text-white/45"
                      }`}
                    >
                      {selectedPhoneCountry?.dialCode ?? "+"}
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent py-1 text-base font-bold text-white outline-none placeholder:text-white/45"
                      autoComplete="tel-national"
                      inputMode="tel"
                      placeholder={tt("Local phone number")}
                      type="tel"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(normalizeNationalPhoneInput(event.target.value, phoneCountryCode))}
                      required
                    />
                  </div>
                </div>
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
