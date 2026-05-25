import { ChangeEvent, useEffect, useId, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Activity,
  Bell,
  Camera,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  Headset,
  IdCard,
  KeyRound,
  Languages,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Smartphone,
  UserRound,
  WalletCards,
  type LucideIcon
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage, identityApi } from "@/api/client";
import { clearAuthSession, getAccessToken } from "@/lib/auth";
import { translateText, useAppLanguage } from "@/lib/i18n";

type KycSubmission = {
  id: string;
  documentType: string | null;
  nationality?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  documentNumber?: string | null;
  documentUrl: string;
  selfieUrl: string;
  status: "pending" | "verified" | "rejected";
  adminNote?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
};

type StoredUser = {
  id?: string;
  publicId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  referralCode?: string;
  kycStatus?: "pending" | "verified" | "rejected";
  hasSecurityPasscode?: boolean;
};

type ProfileScreen = "settings" | "security" | "real-name-details" | "real-name-upload";

type UploadFieldProps = {
  title: string;
  helper: string;
  fileName?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

type SettingsRowProps = {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
};

type SecurityRowProps = SettingsRowProps & {
  status: string;
  active?: boolean;
};

const fieldClass =
  "fndk-app-input";

const resolveApiErrorMessage = (fallback: string, error: unknown) => getApiErrorMessage(error, fallback);

const readStoredUser = (): StoredUser => {
  try {
    const storedUser = localStorage.getItem("nevo.user");
    return storedUser ? JSON.parse(storedUser) : {};
  } catch {
    return {};
  }
};

const writeStoredUser = (user: StoredUser) => {
  localStorage.setItem("nevo.user", JSON.stringify({ ...readStoredUser(), ...user }));
};

const fallbackPublicId = (userId?: string) => {
  if (!userId) {
    return "";
  }

  let hash = 0;
  for (const character of userId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return ((hash % 900_000) + 100_000).toString();
};

const resolvePublicId = (user: StoredUser) => {
  const publicId = user.publicId?.trim();

  if (publicId && /^\d{6}$/.test(publicId)) {
    return publicId;
  }

  return fallbackPublicId(user.id);
};

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const language = useAppLanguage();

  return (
    <header className="relative z-20 border-b border-cyan-200/10 bg-[#06074c]/95 px-4 py-4 backdrop-blur-md">
      <div className="grid grid-cols-[42px_minmax(0,1fr)_42px] items-center">
        <button
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition hover:bg-white/5 hover:text-white"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="truncate text-center text-[1.15rem] font-extrabold tracking-[-0.02em] text-white">{translateText(language, title)}</div>
        <div />
      </div>
    </header>
  );
}

function SettingsRow({ icon: Icon, label, onClick }: SettingsRowProps) {
  const language = useAppLanguage();

  return (
    <button
      className="flex min-h-[54px] w-full items-center justify-between gap-3 border-b border-cyan-200/10 px-4 py-3.5 text-left text-white last:border-b-0 transition hover:bg-cyan-300/5"
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-cyan-300/[0.08] text-cyan-200">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="truncate text-[0.96rem] font-semibold">{translateText(language, label)}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
    </button>
  );
}

function SecurityRow({ icon: Icon, label, status, active, onClick }: SecurityRowProps) {
  const language = useAppLanguage();

  return (
    <button
      className={`grid min-h-[94px] w-full grid-cols-[minmax(0,1fr)_70px] items-center gap-4 border-b border-cyan-200/10 px-4 py-4 text-left last:border-b-0 transition hover:bg-cyan-300/5 ${
        active ? "bg-cyan-300/5 shadow-[inset_0_0_0_1px_rgba(255,78,90,0.55)]" : ""
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0">
        <span className="block truncate text-[1.02rem] font-extrabold text-white">{translateText(language, label)}</span>
        <span className="mt-3 inline-flex max-w-full items-center rounded-[6px] border border-cyan-300/10 bg-[#050a4f] px-3 py-1.5 text-[0.78rem] font-semibold text-slate-300">
          {translateText(language, status)}
        </span>
      </span>
      <span className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-cyan-300/20 bg-[#0d1680] text-cyan-200 shadow-[0_0_20px_rgba(59,104,255,0.25)]">
        <Icon className="h-7 w-7" />
      </span>
    </button>
  );
}

function VerificationProgress({ step }: { step: 1 | 2 }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#0c155d] shadow-[inset_0_0_0_1px_rgba(102,143,255,0.15)]">
      <div
        className="h-full rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(103,232,255,0.75)] transition-all"
        style={{ width: step === 1 ? "50%" : "100%" }}
      />
    </div>
  );
}

function VerificationNotice() {
  return (
    <div className="mt-4 flex gap-2 text-[0.77rem] font-medium leading-5 text-slate-300">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 fill-amber-300 text-[#5b4300]" />
      <span>After clicking real-name authentication, upload documents for approval. Add the document name and keep the document photo clear.</span>
    </div>
  );
}

function ReminderPanel() {
  return (
    <section className="mt-7 rounded-[12px] border border-cyan-300/20 bg-[#111d92]/[0.82] p-4 shadow-[inset_0_1px_0_rgba(157,218,255,0.16),0_0_24px_rgba(54,89,255,0.25)]">
      <div className="text-[1rem] font-extrabold text-cyan-200">Real-Name Authentication Reminder</div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[0.78rem] font-semibold leading-5 text-white">
        <li>Government-issued identification documents.</li>
        <li>Original, full-sized, uploaded photo.</li>
        <li>Photo without mirror, border, watermark, and stray items.</li>
        <li>Align the document with the viewfinder when taking the photo.</li>
      </ol>
    </section>
  );
}

function VerificationUploadField({ title, helper, fileName, onChange }: UploadFieldProps) {
  const inputId = useId();

  return (
    <div className="space-y-3">
      <div className="text-[1rem] font-extrabold text-white">{title}</div>
      <label
        className="block cursor-pointer overflow-hidden rounded-[10px] border border-[#263eaa] bg-[#0b147a] shadow-[inset_0_0_24px_rgba(48,78,220,0.32)]"
        htmlFor={inputId}
      >
        <div className="relative mx-auto my-3 flex min-h-[168px] w-[86%] max-w-[330px] flex-col items-center justify-center rounded-[8px] bg-[linear-gradient(180deg,rgba(15,27,137,0.98),rgba(9,18,105,0.98))] px-5 text-center">
          <div className="absolute inset-x-5 top-5 h-9 rounded-t-[14px] border-t-4 border-[#263dbe]" />
          <div className="relative flex h-24 w-44 items-center justify-center overflow-hidden rounded-[8px] bg-[#132092] shadow-[inset_0_0_18px_rgba(42,76,255,0.28)]">
            <UserRound className="h-16 w-16 text-[#f1cf9d]" />
            <span className="absolute right-8 top-7 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-300 text-[#06115d] shadow-[0_0_18px_rgba(103,232,255,0.75)]">
              <Camera className="h-7 w-7" />
            </span>
          </div>
          <div className="mt-3 max-w-[280px] text-[0.8rem] font-extrabold leading-5 text-white">{helper}</div>
          <div className="mt-2 max-w-full truncate text-[0.72rem] font-semibold text-cyan-200">
            {fileName ?? "Tap to upload"}
          </div>
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

export function ProfilePage() {
  const navigate = useNavigate();
  const language = useAppLanguage();
  const tt = (text: string) => translateText(language, text);
  const [screen, setScreen] = useState<ProfileScreen>("settings");
  const [storedUser, setStoredUser] = useState<StoredUser>(() => readStoredUser());
  const [documentType, setDocumentType] = useState("Passport");
  const [nationality, setNationality] = useState("America");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [documentFile, setDocumentFile] = useState<File>();
  const [selfieFile, setSelfieFile] = useState<File>();
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [securityPasscode, setSecurityPasscode] = useState("");
  const [securityPasscodeConfirm, setSecurityPasscodeConfirm] = useState("");
  const [savingSecurityPasscode, setSavingSecurityPasscode] = useState(false);
  const [showPasscodeEditor, setShowPasscodeEditor] = useState(false);
  const [hasSecurityPasscode, setHasSecurityPasscode] = useState(Boolean(storedUser.hasSecurityPasscode));

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }

    let active = true;

    const loadUserProfile = async () => {
      try {
        const response = await identityApi.get<StoredUser>("/auth/me");

        if (active) {
          setStoredUser(response.data);
          setHasSecurityPasscode(Boolean(response.data.hasSecurityPasscode));
          writeStoredUser(response.data);
        }
      } catch {
        return;
      }
    };

    const loadKycSubmissions = async () => {
      try {
        const response = await identityApi.get<KycSubmission[]>("/kyc/submissions/me");

        if (active) {
          setSubmissions(response.data);
        }
      } catch {
        if (active) {
          setSubmissions([]);
        }
      }
    };

    void loadUserProfile();
    void loadKycSubmissions();

    return () => {
      active = false;
    };
  }, []);

  const latestSubmission = submissions[0];

  const realNameStatus = useMemo(() => {
    if (latestSubmission?.status === "verified" || storedUser.kycStatus === "verified") {
      return "Verified";
    }

    if (latestSubmission?.status === "pending") {
      return "Under Review";
    }

    if (latestSubmission?.status === "rejected" || storedUser.kycStatus === "rejected") {
      return "Rejected";
    }

    return "Go To Verify";
  }, [latestSubmission?.status, storedUser.kycStatus]);

  const displayName = storedUser.fullName?.trim() || "FNDK User";
  const displayEmail = storedUser.email?.trim() || "email not set";
  const displayPublicId = resolvePublicId(storedUser);
  const referralCode = storedUser.referralCode?.trim() ?? "";

  const copySettingValue = async (value: string, label: string) => {
    if (!value) {
      toast.error(`${label} is not available yet.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const validateRealNameDetails = () => {
    if (!nationality.trim() || !lastName.trim() || !firstName.trim() || !documentNumber.trim()) {
      toast.error("Complete all real-name verification fields.");
      return false;
    }

    return true;
  };

  const submitKyc = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    if (!validateRealNameDetails()) {
      setScreen("real-name-details");
      return;
    }

    if (!documentFile || !selfieFile) {
      toast.error("Upload the front of the document and holding document photo.");
      return;
    }

    const formData = new FormData();
    formData.append("documentType", documentType.trim() || "Passport");
    formData.append("nationality", nationality.trim());
    formData.append("firstName", firstName.trim());
    formData.append("lastName", lastName.trim());
    formData.append("documentNumber", documentNumber.trim());
    formData.append("idDocument", documentFile);
    formData.append("selfie", selfieFile);

    setSubmittingKyc(true);
    try {
      const response = await identityApi.post<KycSubmission>("/kyc/submissions", formData);

      setSubmissions((current) => [response.data, ...current]);
      setScreen("security");
      toast.success("Real-name verification submitted for review.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Real-name verification failed.", error));
    } finally {
      setSubmittingKyc(false);
    }
  };

  const saveSecurityPasscode = async () => {
    const token = getAccessToken();
    if (!token) {
      toast.error("Sign in first.");
      return;
    }

    if (!/^\d{6}$/.test(securityPasscode)) {
      toast.error("Transaction password must be exactly 6 digits.");
      return;
    }

    if (securityPasscode !== securityPasscodeConfirm) {
      toast.error("Transaction passwords do not match.");
      return;
    }

    setSavingSecurityPasscode(true);
    try {
      await identityApi.post("/auth/security-passcode", { passcode: securityPasscode });

      const currentUser = readStoredUser();
      localStorage.setItem("nevo.user", JSON.stringify({ ...currentUser, hasSecurityPasscode: true }));

      setHasSecurityPasscode(true);
      setSecurityPasscode("");
      setSecurityPasscodeConfirm("");
      setShowPasscodeEditor(false);
      toast.success("Transaction password saved.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not save transaction password.", error));
    } finally {
      setSavingSecurityPasscode(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  const renderSettings = () => (
    <div className="px-4 pb-4 pt-6">
      <section className="fndk-profile-card p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[6px] border-lime-300 bg-[#efffff] text-[#070b52] shadow-[0_0_26px_rgba(124,255,139,0.28)]">
            <UserRound className="h-10 w-10" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[1.05rem] font-extrabold text-white"># {displayName}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-[0.68rem] font-semibold text-slate-300">
              <span className="rounded-full bg-cyan-300/10 px-2 py-1 text-cyan-200">VIP0</span>
              <span className="rounded-full bg-white/5 px-2 py-1">{realNameStatus}</span>
            </div>
            <div className="mt-2 truncate text-[0.76rem] font-medium text-slate-300">{displayEmail}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 border-t border-cyan-200/10 pt-4 text-[0.78rem]">
          <div className="flex min-h-10 items-center justify-between gap-3 rounded-[10px] bg-white/[0.04] px-3">
            <span className="font-semibold text-slate-300">{tt("User ID")}</span>
            <span className="font-mono text-sm font-extrabold tracking-[0.18em] text-cyan-100">
              {displayPublicId || "------"}
            </span>
          </div>
          <div className="flex min-h-10 items-center justify-between gap-3 rounded-[10px] bg-white/[0.04] px-3">
            <span className="font-semibold text-slate-300">{tt("Referral code")}</span>
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-sm font-extrabold text-cyan-100">
                {referralCode || tt("Not available")}
              </span>
              <button
                aria-label="Copy referral code"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-40"
                disabled={!referralCode}
                onClick={() => void copySettingValue(referralCode, "Referral code")}
                type="button"
              >
                <Copy className="h-4 w-4" />
              </button>
            </span>
          </div>
        </div>
      </section>

      <section className="fndk-settings-card mt-5 overflow-hidden">
        <SettingsRow icon={UserRound} label="Personal Information" onClick={() => navigate("/app/settings/personal-information")} />
        <SettingsRow icon={FileText} label="Department Order" onClick={() => navigate("/app/trades")} />
        <SettingsRow icon={LockKeyhole} label="Login Password" onClick={() => navigate("/app/settings/login-password")} />
        <SettingsRow icon={ShieldCheck} label="Security Center" onClick={() => setScreen("security")} />
        <SettingsRow icon={Activity} label="Activity Information" onClick={() => navigate("/app/settings/activity")} />
        <SettingsRow icon={Bell} label="Notifications" onClick={() => navigate("/app/settings/notifications")} />
        <SettingsRow icon={Languages} label="Language" onClick={() => navigate("/app/settings/language")} />
        <SettingsRow icon={Headset} label="Help Center" onClick={() => navigate("/app/settings/help")} />
      </section>

      <button
        className="fndk-primary-action mt-6 w-full"
        onClick={handleLogout}
        type="button"
      >
        {tt("Logout")}
      </button>
    </div>
  );

  const renderPasscodeEditor = () => (
    <section className="mt-4 rounded-[10px] border border-cyan-300/15 bg-[#0b1479]/90 p-4 shadow-[0_0_22px_rgba(49,94,255,0.18)]">
      <div className="flex items-center gap-2 text-[0.92rem] font-extrabold text-cyan-200">
        <KeyRound className="h-4 w-4" />
        Transaction Password
      </div>
      <div className="mt-4 grid gap-3">
        <input
          className={`${fieldClass} text-center tracking-[0.28em]`}
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          type="password"
          value={securityPasscode}
          onChange={(event) => setSecurityPasscode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <input
          className={`${fieldClass} text-center tracking-[0.28em]`}
          inputMode="numeric"
          maxLength={6}
          placeholder="Confirm"
          type="password"
          value={securityPasscodeConfirm}
          onChange={(event) => setSecurityPasscodeConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button
          className="fndk-primary-action disabled:opacity-60"
          disabled={savingSecurityPasscode}
          onClick={() => void saveSecurityPasscode()}
          type="button"
        >
          {savingSecurityPasscode ? "Saving..." : hasSecurityPasscode ? "Update Password" : "Set Password"}
        </button>
      </div>
    </section>
  );

  const renderSecurity = () => (
    <div className="pb-5">
      <ScreenHeader title="Security Center" onBack={() => setScreen("settings")} />
      <div className="px-4 pt-6">
        <section className="fndk-settings-card overflow-hidden">
          <SecurityRow icon={WalletCards} label="Withdrawal Address" status="Go To Setting" onClick={() => navigate("/app/settings/withdrawal-address")} />
          <SecurityRow
            active
            icon={IdCard}
            label="Real-Name Verification"
            status={realNameStatus}
            onClick={() => setScreen("real-name-details")}
          />
          <SecurityRow icon={Smartphone} label="Phone Number" status="Go To Setting" onClick={() => navigate("/app/settings/phone")} />
          <SecurityRow icon={Mail} label="Email" status="Go To Setting" onClick={() => navigate("/app/settings/email")} />
          <SecurityRow icon={LockKeyhole} label="Login Password" status="Go To Setting" onClick={() => navigate("/app/settings/login-password")} />
          <SecurityRow
            icon={KeyRound}
            label="Transaction Password"
            status={hasSecurityPasscode ? "Already Set" : "Go To Setting"}
            onClick={() => setShowPasscodeEditor((current) => !current)}
          />
        </section>
        {showPasscodeEditor ? renderPasscodeEditor() : null}
      </div>
    </div>
  );

  const renderRealNameDetails = () => (
    <div className="pb-6">
      <ScreenHeader title="Real-Name Verification" onBack={() => setScreen("security")} />
      <div className="px-5 pt-6">
        <VerificationProgress step={1} />
        <VerificationNotice />

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (validateRealNameDetails()) {
              setScreen("real-name-upload");
            }
          }}
        >
          <label className="block">
            <span className="mb-2 block text-[0.9rem] font-extrabold text-white">Nationality</span>
            <select className={fieldClass} value={nationality} onChange={(event) => setNationality(event.target.value)}>
              <option>America</option>
              <option>Tunisia</option>
              <option>Germany</option>
              <option>France</option>
              <option>United Kingdom</option>
              <option>United Arab Emirates</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.9rem] font-extrabold text-white">Last Name</span>
            <input
              className={fieldClass}
              placeholder="Please enter last name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.9rem] font-extrabold text-white">First Name</span>
            <input
              className={fieldClass}
              placeholder="Please enter first name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.9rem] font-extrabold text-white">Document Type</span>
            <select className={fieldClass} value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              <option>Passport</option>
              <option>National ID</option>
              <option>Driver License</option>
              <option>Residence Permit</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[0.9rem] font-extrabold text-white">Document Number</span>
            <input
              className={fieldClass}
              placeholder="Please fill correct number"
              value={documentNumber}
              onChange={(event) => setDocumentNumber(event.target.value)}
            />
          </label>

          <button className="fndk-primary-action w-full" type="submit">
            Next Step
          </button>
        </form>

        <ReminderPanel />
      </div>
    </div>
  );

  const renderRealNameUpload = () => (
    <div className="pb-6">
      <ScreenHeader title="Real-Name Verification" onBack={() => setScreen("real-name-details")} />
      <div className="px-5 pt-6">
        <VerificationProgress step={2} />
        <VerificationNotice />

        <div className="mt-6 space-y-6">
          <VerificationUploadField
            fileName={documentFile?.name}
            helper="Please upload JPG, JPEG, PNG format file less than 3M."
            onChange={(event) => setDocumentFile(event.target.files?.[0])}
            title="Front Of Document"
          />

          <VerificationUploadField
            fileName={selfieFile?.name}
            helper="Please upload JPG, JPEG, PNG format file less than 3M."
            onChange={(event) => setSelfieFile(event.target.files?.[0])}
            title="Holding Document"
          />

          <button
            className="fndk-primary-action w-full disabled:opacity-60"
            disabled={submittingKyc}
            onClick={() => void submitKyc()}
            type="button"
          >
            {submittingKyc ? "Submitting..." : "Submit For Review"}
          </button>
        </div>

        <ReminderPanel />
      </div>
    </div>
  );

  return (
    <div className="min-h-full pb-2">
      {screen === "settings" ? renderSettings() : null}
      {screen === "security" ? renderSecurity() : null}
      {screen === "real-name-details" ? renderRealNameDetails() : null}
      {screen === "real-name-upload" ? renderRealNameUpload() : null}
    </div>
  );
}
