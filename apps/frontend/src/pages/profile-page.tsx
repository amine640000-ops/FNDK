import { ChangeEvent, useEffect, useId, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ChevronRight, ExternalLink, FileText, KeyRound, ShieldCheck, Upload, UserRound } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile-page-header";

const identityApiBase = import.meta.env.VITE_IDENTITY_API_URL ?? "http://localhost:4001/api";
const identityUploadsBase = identityApiBase.replace(/\/api\/?$/, "");

const identityApi = axios.create({
  baseURL: identityApiBase
});

type KycSubmission = {
  id: string;
  documentType: string | null;
  documentUrl: string;
  selfieUrl: string;
  status: "pending" | "verified" | "rejected";
  adminNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
};

type UploadFieldProps = {
  title: string;
  description: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  fileName?: string;
};

const resolveApiErrorMessage = (fallback: string, error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const responseMessage = error.response?.data?.message;
  if (Array.isArray(responseMessage)) {
    return responseMessage.join(" ");
  }

  return typeof responseMessage === "string" ? responseMessage : fallback;
};

function UploadField({ title, description, onChange, fileName }: UploadFieldProps) {
  const inputId = useId();

  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] border border-dashed border-white/15 bg-white/5">
      <label className="block cursor-pointer px-4 py-4" htmlFor={inputId}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-medium text-white">{title}</div>
            <div className="mt-1 text-[13px] text-slate-400">{description}</div>
          </div>
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
            <Upload className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-4 flex min-w-0 items-center gap-3">
          <span className="inline-flex shrink-0 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[12px] font-semibold text-cyan-100">
            Choose file
          </span>
          <span className="min-w-0 truncate text-[12px] text-slate-300">
            {fileName ?? "No file selected"}
          </span>
        </div>
      </label>

      <input
        accept="image/png,image/jpeg,image/webp,application/pdf"
        className="sr-only"
        id={inputId}
        onChange={onChange}
        type="file"
      />
    </div>
  );
}

const resolveKycUploadUrl = (url: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${identityUploadsBase}${url}`;
};

export function ProfilePage() {
  const [documentType, setDocumentType] = useState("");
  const [documentFile, setDocumentFile] = useState<File>();
  const [selfieFile, setSelfieFile] = useState<File>();
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [securityPasscode, setSecurityPasscode] = useState("");
  const [securityPasscodeConfirm, setSecurityPasscodeConfirm] = useState("");
  const [savingSecurityPasscode, setSavingSecurityPasscode] = useState(false);
  const [hasSecurityPasscode, setHasSecurityPasscode] = useState(() => {
    try {
      const storedUser = localStorage.getItem("nevo.user");
      return storedUser ? Boolean(JSON.parse(storedUser).hasSecurityPasscode) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      return;
    }

    let active = true;

    const loadKycSubmissions = async () => {
      try {
        const response = await identityApi.get<KycSubmission[]>("/kyc/submissions/me", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (active) {
          setSubmissions(response.data);
        }
      } catch {
        if (active) {
          setSubmissions([]);
        }
      }
    };

    void loadKycSubmissions();

    return () => {
      active = false;
    };
  }, []);

  const submitKyc = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    if (!documentFile || !selfieFile) {
      toast.error("Upload both your ID document and selfie.");
      return;
    }

    const formData = new FormData();
    formData.append("documentType", documentType.trim() || "government-id");
    formData.append("idDocument", documentFile);
    formData.append("selfie", selfieFile);

    setSubmittingKyc(true);
    try {
      const response = await identityApi.post<KycSubmission>("/kyc/submissions", formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setSubmissions((current) => [response.data, ...current]);
      toast.success("KYC submitted for admin review.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("KYC submission failed.", error));
    } finally {
      setSubmittingKyc(false);
    }
  };

  const saveSecurityPasscode = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    if (!/^\d{6}$/.test(securityPasscode)) {
      toast.error("Security passcode must be exactly 6 digits.");
      return;
    }

    if (securityPasscode !== securityPasscodeConfirm) {
      toast.error("Security passcodes do not match.");
      return;
    }

    setSavingSecurityPasscode(true);
    try {
      await identityApi.post(
        "/auth/security-passcode",
        { passcode: securityPasscode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const storedUser = localStorage.getItem("nevo.user");
      if (storedUser) {
        localStorage.setItem("nevo.user", JSON.stringify({ ...JSON.parse(storedUser), hasSecurityPasscode: true }));
      }

      setHasSecurityPasscode(true);
      setSecurityPasscode("");
      setSecurityPasscodeConfirm("");
      toast.success("Security passcode saved.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not save security passcode.", error));
    } finally {
      setSavingSecurityPasscode(false);
    }
  };

  return (
    <div className="pb-6">
      <MobilePageHeader title="My Profile" subtitle="account settings" />

      <div className="px-4 pt-5">
        <section className="neon-panel p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
              <UserRound className="h-7 w-7" />
            </div>
            <div>
              <div className="text-[1.35rem] font-bold text-white">Investor Profile</div>
              <div className="mt-1 text-[13px] text-slate-300">
                Update your identity details, security preferences, and KYC materials.
              </div>
            </div>
          </div>
        </section>

        <section className="neon-soft-panel mt-5 p-5">
          <div className="text-sm uppercase tracking-[0.26em] text-cyan-200/75">Personal information</div>
          <div className="mt-4 grid gap-3">
            <input
              className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-[15px] text-white outline-none transition focus:border-cyan-300/40"
              placeholder="Full name"
            />
            <input
              className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-[15px] text-white outline-none transition focus:border-cyan-300/40"
              placeholder="Email address"
            />
            <input
              className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-[15px] text-white outline-none transition focus:border-cyan-300/40"
              placeholder="Phone number"
            />
            <button className="mt-1 rounded-[20px] bg-cyan-400 px-4 py-4 text-[15px] font-semibold text-slate-950">
              Save Profile
            </button>
          </div>
        </section>

        <section className="neon-soft-panel mt-5 p-5">
          <div className="flex items-center gap-2 text-cyan-200">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm uppercase tracking-[0.24em]">Security center</span>
          </div>

          <div className="mt-4 rounded-[22px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-4 text-[14px] leading-6 text-emerald-200">
            KYC status will update after your first submission review.
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-[22px] border border-cyan-300/15 bg-cyan-300/10 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-cyan-100">
                  <KeyRound className="h-4 w-4 shrink-0" />
                  <span className="text-sm font-semibold uppercase tracking-[0.2em]">Security passcode</span>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  hasSecurityPasscode ? "bg-emerald-300/12 text-emerald-100" : "bg-amber-300/12 text-amber-100"
                }`}>
                  {hasSecurityPasscode ? "Set" : "Missing"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-center text-[18px] font-semibold tracking-[0.28em] text-white outline-none transition focus:border-cyan-300/40"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  type="password"
                  value={securityPasscode}
                  onChange={(event) => setSecurityPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <input
                  className="w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-center text-[18px] font-semibold tracking-[0.28em] text-white outline-none transition focus:border-cyan-300/40"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Confirm"
                  type="password"
                  value={securityPasscodeConfirm}
                  onChange={(event) => setSecurityPasscodeConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              <button
                className="mt-3 w-full rounded-[20px] bg-cyan-400 px-4 py-3.5 text-[15px] font-semibold text-slate-950 disabled:opacity-60"
                disabled={savingSecurityPasscode}
                onClick={() => void saveSecurityPasscode()}
                type="button"
              >
                {savingSecurityPasscode ? "Saving..." : hasSecurityPasscode ? "Update passcode" : "Set passcode"}
              </button>
            </div>
            <button
              className="flex w-full items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-left text-[15px] text-white"
              type="button"
            >
              <span>Change password</span>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </button>
            <button
              className="flex w-full items-center justify-between rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-left text-[15px] text-white"
              type="button"
            >
              <span>Enable TOTP 2FA</span>
              <ChevronRight className="h-5 w-5 text-slate-400" />
            </button>
          </div>
        </section>

        <section className="neon-panel mt-5 overflow-hidden p-5">
          <div className="flex items-center gap-2 text-cyan-200">
            <FileText className="h-4 w-4" />
            <span className="text-sm uppercase tracking-[0.24em]">KYC submission</span>
          </div>

          <div className="mt-4 grid min-w-0 gap-3">
            <input
              className="w-full min-w-0 max-w-full rounded-[20px] border border-white/10 bg-[#080b56]/90 px-4 py-4 text-[15px] text-white outline-none transition focus:border-cyan-300/40"
              placeholder="Document type"
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value)}
            />

            <UploadField
              description="Passport, national ID, or driver&apos;s license"
              fileName={documentFile?.name}
              onChange={(event) => setDocumentFile(event.target.files?.[0])}
              title="Upload ID document"
            />

            <UploadField
              description="Clear face photo with good lighting"
              fileName={selfieFile?.name}
              onChange={(event) => setSelfieFile(event.target.files?.[0])}
              title="Upload selfie"
            />

            <button
              className="mt-1 w-full min-w-0 max-w-full rounded-[20px] bg-cyan-400 px-4 py-4 text-[15px] font-semibold text-slate-950 disabled:opacity-60"
              disabled={submittingKyc}
              onClick={() => void submitKyc()}
              type="button"
            >
              {submittingKyc ? "Submitting..." : "Submit KYC"}
            </button>

            {submissions.length ? (
              <div className="mt-2 grid gap-3">
                {submissions.slice(0, 3).map((submission) => (
                  <div key={submission.id} className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4 text-[13px] text-slate-300">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-semibold text-white">{submission.documentType ?? "government-id"}</span>
                      <span className="uppercase tracking-[0.18em] text-cyan-200">{submission.status}</span>
                    </div>
                    <div className="mt-2">{new Date(submission.submittedAt).toLocaleString("en-GB")}</div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <a
                        className="inline-flex items-center gap-2 text-cyan-200"
                        href={resolveKycUploadUrl(submission.documentUrl)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        ID document
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <a
                        className="inline-flex items-center gap-2 text-cyan-200"
                        href={resolveKycUploadUrl(submission.selfieUrl)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Selfie
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
