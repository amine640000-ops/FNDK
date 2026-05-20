import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Activity,
  ArrowLeftRight,
  Bell,
  Check,
  ChevronRight,
  Copy,
  Headset,
  KeyRound,
  Languages,
  Mail,
  Phone,
  ShieldCheck,
  UserRound,
  WalletCards
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { AssetType, DashboardTransaction, WalletSummary } from "@nevo/shared-types";
import { SUPPORTED_ASSETS, formatCurrency } from "@nevo/shared-utils";
import { getApiErrorMessage, identityApi, notificationApi, walletApi } from "@/api/client";
import { MobilePageHeader } from "@/components/mobile-page-header";
import { authHeaders, getAccessToken } from "@/lib/auth";

type StoredUser = {
  id?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  referralCode?: string;
  kycStatus?: "pending" | "verified" | "rejected";
  emailVerifiedAt?: string | null;
  hasSecurityPasscode?: boolean;
};

type NotificationItem = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
};

type WithdrawalSettings = {
  asset: AssetType;
  label: string;
  address: string;
};

type TransferRequest = {
  id: string;
  asset: AssetType;
  amount: number;
  from: string;
  to: string;
  status: "pending";
  createdAt: string;
};

type LanguageCode = "en" | "fr" | "ar";

const emptySummary: WalletSummary = {
  totalBalance: 0,
  activeInvestment: 0,
  availableToWithdraw: 0,
  totalEarned: 0,
  assets: []
};

const assetLabels: Record<AssetType, string> = {
  BTC: "BTC",
  ETH: "ETH",
  USDT_TRC20: "USDT (TRC20)",
  USDT_ERC20: "USDT (ERC20)",
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  STOCKS: "STOCKS"
};

const resolveApiErrorMessage = (fallback: string, error: unknown) => getApiErrorMessage(error, fallback);

const getToken = getAccessToken;

const readStoredUser = (): StoredUser => {
  try {
    const storedUser = localStorage.getItem("nevo.user");
    return storedUser ? JSON.parse(storedUser) : {};
  } catch {
    return {};
  }
};

const writeStoredUser = (user: StoredUser) => {
  const currentUser = readStoredUser();
  localStorage.setItem("nevo.user", JSON.stringify({ ...currentUser, ...user }));
};

const readLanguage = (): LanguageCode => {
  const stored = localStorage.getItem("nevo.language");
  return stored === "fr" || stored === "ar" ? stored : "en";
};

const applyLanguagePreference = (language: LanguageCode) => {
  localStorage.setItem("nevo.language", language);
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
};

const normalizeNotifications = (value: unknown): NotificationItem[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is NotificationItem => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const notification = item as Partial<NotificationItem>;
      return (
        typeof notification.id === "string" &&
        typeof notification.title === "string" &&
        typeof notification.message === "string" &&
        typeof notification.createdAt === "string"
      );
    });
  }

  if (value && typeof value === "object" && "notifications" in value) {
    return normalizeNotifications((value as { notifications?: unknown }).notifications);
  }

  return [];
};

const readWithdrawalSettings = (): WithdrawalSettings => {
  try {
    const saved = localStorage.getItem("nevo.withdrawalAddress");
    if (!saved) {
      return { asset: "USDT_TRC20", label: "Default payout wallet", address: "" };
    }

    if (saved.trim().startsWith("{")) {
      return JSON.parse(saved) as WithdrawalSettings;
    }

    return { asset: "USDT_TRC20", label: "Default payout wallet", address: saved };
  } catch {
    return { asset: "USDT_TRC20", label: "Default payout wallet", address: "" };
  }
};

const readTransferRequests = (): TransferRequest[] => {
  try {
    const saved = localStorage.getItem("nevo.transferRequests");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

function SettingsShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="pb-6">
      <MobilePageHeader title={title} subtitle={subtitle} />
      <div className="px-4 pt-5">{children}</div>
    </div>
  );
}

function StatusCard({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: typeof UserRound;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="neon-panel p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 text-cyan-200">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[1.12rem] font-extrabold text-white">{title}</div>
          <div className="mt-1 text-[13px] leading-5 text-slate-300">{description}</div>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[18px] border border-cyan-300/15 bg-white/[0.04] px-4 py-5 text-center text-sm text-slate-300">
      {text}
    </div>
  );
}

export function PersonalInformationPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(() => readStoredUser().fullName ?? "");
  const [phone, setPhone] = useState(() => readStoredUser().phone ?? "");
  const [email, setEmail] = useState(() => readStoredUser().email ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }

    identityApi
      .get<StoredUser>("/auth/me", { headers: authHeaders() })
      .then((response) => {
        setFullName(response.data.fullName ?? "");
        setPhone(response.data.phone ?? "");
        setEmail(response.data.email ?? "");
        writeStoredUser(response.data);
      })
      .catch(() => undefined);
  }, []);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const token = getToken();
    if (!token) {
      toast.error("Sign in first.");
      navigate("/login", { replace: true });
      return;
    }

    setSaving(true);
    try {
      const response = await identityApi.patch<StoredUser>(
        "/auth/me",
        { fullName: fullName.trim(), phone: phone.trim() },
        { headers: authHeaders() }
      );
      writeStoredUser(response.data);
      toast.success("Personal information saved.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not save personal information.", error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsShell title="Personal Info" subtitle="account profile">
      <form className="neon-soft-panel grid gap-4 p-5" onSubmit={saveProfile}>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Full name</span>
          <input className="fndk-app-input" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Email</span>
          <input className="fndk-app-input opacity-70" disabled value={email} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Phone number</span>
          <input className="fndk-app-input" placeholder="+21656109879" value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <button className="fndk-primary-action disabled:opacity-60" disabled={saving} type="submit">
          {saving ? "Saving..." : "Save information"}
        </button>
      </form>
    </SettingsShell>
  );
}

export function PhoneSettingsPage() {
  return <PersonalInformationPage />;
}

export function EmailSettingsPage() {
  const [email] = useState(() => readStoredUser().email ?? "");
  const [sending, setSending] = useState(false);

  const resendVerification = async () => {
    if (!email) {
      toast.error("No email is saved for this account.");
      return;
    }

    setSending(true);
    try {
      await identityApi.post("/auth/resend-email-verification", { email });
      toast.success("Verification email sent.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not send verification email.", error));
    } finally {
      setSending(false);
    }
  };

  return (
    <SettingsShell title="Email" subtitle="account email">
      <StatusCard
        icon={Mail}
        title={email || "Email not set"}
        description="Your email is used for login, withdrawal codes, password recovery, and platform notifications."
        action={
          <button className="fndk-primary-action w-full disabled:opacity-60" disabled={sending} onClick={() => void resendVerification()} type="button">
            {sending ? "Sending..." : "Resend verification email"}
          </button>
        }
      />
    </SettingsShell>
  );
}

export function LoginPasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    const token = getToken();
    if (!token) {
      toast.error("Sign in first.");
      navigate("/login", { replace: true });
      return;
    }

    if (password !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await identityApi.post(
        "/auth/password",
        { currentPassword, password },
        { headers: authHeaders() }
      );
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      toast.success("Login password updated.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not update password.", error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsShell title="Login Password" subtitle="security">
      <form className="neon-soft-panel grid gap-4 p-5" onSubmit={savePassword}>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Current password</span>
          <input className="fndk-app-input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">New password</span>
          <input className="fndk-app-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Confirm new password</span>
          <input className="fndk-app-input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        <button className="fndk-primary-action disabled:opacity-60" disabled={saving} type="submit">
          {saving ? "Saving..." : "Update password"}
        </button>
      </form>
    </SettingsShell>
  );
}

export function WithdrawalAddressPage() {
  const [settings, setSettings] = useState<WithdrawalSettings>(() => readWithdrawalSettings());

  const saveAddress = (event: FormEvent) => {
    event.preventDefault();
    if (!settings.address.trim()) {
      toast.error("Enter a withdrawal address.");
      return;
    }

    const nextSettings = { ...settings, address: settings.address.trim(), label: settings.label.trim() || "Default payout wallet" };
    localStorage.setItem("nevo.withdrawalAddress", JSON.stringify(nextSettings));
    setSettings(nextSettings);
    toast.success("Withdrawal address saved.");
  };

  return (
    <SettingsShell title="Withdrawal Address" subtitle="payout destination">
      <form className="neon-soft-panel grid gap-4 p-5" onSubmit={saveAddress}>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Asset</span>
          <select
            className="fndk-app-input"
            value={settings.asset}
            onChange={(event) => setSettings((current) => ({ ...current, asset: event.target.value as AssetType }))}
          >
            {SUPPORTED_ASSETS.map((asset) => (
              <option key={asset} value={asset}>
                {assetLabels[asset]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Label</span>
          <input
            className="fndk-app-input"
            value={settings.label}
            onChange={(event) => setSettings((current) => ({ ...current, label: event.target.value }))}
          />
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Address</span>
          <textarea
            className="fndk-app-input min-h-28 resize-none"
            placeholder="Wallet address, IBAN, or payout destination"
            value={settings.address}
            onChange={(event) => setSettings((current) => ({ ...current, address: event.target.value }))}
          />
        </label>
        <button className="fndk-primary-action" type="submit">
          Save withdrawal address
        </button>
        <Link className="fndk-secondary-action block" to="/app/wallet/withdraw">
          Open withdraw page
        </Link>
      </form>
    </SettingsShell>
  );
}

export function AssetTransferPage() {
  const [summary, setSummary] = useState<WalletSummary>(emptySummary);
  const [asset, setAsset] = useState<AssetType>("USD");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"available-to-strategy" | "strategy-to-available">("available-to-strategy");
  const [requests, setRequests] = useState<TransferRequest[]>(() => readTransferRequests());
  const parsedAmount = useMemo(() => Number(amount || 0), [amount]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      return;
    }

    walletApi
      .get<WalletSummary>("/wallet/summary", { headers: authHeaders() })
      .then((response) => setSummary(response.data))
      .catch(() => undefined);
  }, []);

  const submitTransfer = (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter a transfer amount.");
      return;
    }

    const nextRequest: TransferRequest = {
      id: crypto.randomUUID(),
      asset,
      amount: parsedAmount,
      from: direction === "available-to-strategy" ? "Available balance" : "Strategy funds",
      to: direction === "available-to-strategy" ? "Strategy funds" : "Available balance",
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const nextRequests = [nextRequest, ...requests].slice(0, 8);
    localStorage.setItem("nevo.transferRequests", JSON.stringify(nextRequests));
    setRequests(nextRequests);
    setAmount("");
    toast.success("Transfer request created.");
  };

  return (
    <SettingsShell title="Asset Transfer" subtitle="internal movement">
      <StatusCard
        icon={ArrowLeftRight}
        title="Available transfer"
        description={`Available balance: ${formatCurrency(summary.availableToWithdraw)}. Active strategy funds: ${formatCurrency(summary.activeInvestment)}.`}
      />
      <form className="neon-soft-panel mt-5 grid gap-4 p-5" onSubmit={submitTransfer}>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Transfer direction</span>
          <select className="fndk-app-input" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>
            <option value="available-to-strategy">Available balance to strategy funds</option>
            <option value="strategy-to-available">Strategy funds to available balance</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Asset</span>
          <select className="fndk-app-input" value={asset} onChange={(event) => setAsset(event.target.value as AssetType)}>
            {SUPPORTED_ASSETS.map((supportedAsset) => (
              <option key={supportedAsset} value={supportedAsset}>
                {assetLabels[supportedAsset]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-300">Amount</span>
          <input className="fndk-app-input" inputMode="decimal" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <button className="fndk-primary-action" type="submit">
          Submit transfer request
        </button>
      </form>
      <section className="neon-soft-panel mt-5 p-5">
        <div className="mb-4 text-[1rem] font-extrabold text-white">Recent transfer requests</div>
        <div className="grid gap-3">
          {requests.length ? (
            requests.map((request) => (
              <div key={request.id} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-white">{assetLabels[request.asset]}</div>
                  <div className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs font-bold uppercase text-cyan-200">{request.status}</div>
                </div>
                <div className="mt-2 text-sm text-slate-300">
                  {request.from} to {request.to}
                </div>
                <div className="mt-2 text-sm font-semibold text-cyan-100">{formatCurrency(request.amount)}</div>
              </div>
            ))
          ) : (
            <EmptyState text="No transfer requests yet." />
          )}
        </div>
      </section>
    </SettingsShell>
  );
}

export function ActivityInformationPage() {
  const [transactions, setTransactions] = useState<DashboardTransaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    Promise.allSettled([
      walletApi.get<DashboardTransaction[]>("/wallet/transactions", { headers: authHeaders() }),
      notificationApi.get<NotificationItem[]>("/notifications", { headers: authHeaders() })
    ])
      .then(([transactionResult, notificationResult]) => {
        if (transactionResult.status === "fulfilled") {
          setTransactions(transactionResult.value.data);
        }
        if (notificationResult.status === "fulfilled") {
          setNotifications(notificationResult.value.data);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SettingsShell title="Activity" subtitle="account history">
      <section className="neon-soft-panel p-5">
        <div className="mb-4 flex items-center gap-2 text-[1rem] font-extrabold text-white">
          <Activity className="h-5 w-5 text-cyan-200" />
          Recent wallet activity
        </div>
        <div className="grid gap-3">
          {loading ? (
            <EmptyState text="Loading activity..." />
          ) : transactions.length ? (
            transactions.slice(0, 8).map((transaction) => (
              <div key={transaction.id} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold capitalize text-white">{transaction.type}</div>
                  <div className="text-sm font-semibold text-cyan-100">{formatCurrency(transaction.amount)}</div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                  <span>{transaction.asset}</span>
                  <span>{transaction.status}</span>
                </div>
              </div>
            ))
          ) : (
            <EmptyState text="No wallet activity yet." />
          )}
        </div>
      </section>

      <section className="neon-soft-panel mt-5 p-5">
        <div className="mb-4 flex items-center gap-2 text-[1rem] font-extrabold text-white">
          <Bell className="h-5 w-5 text-cyan-200" />
          Recent notifications
        </div>
        <div className="grid gap-3">
          {notifications.length ? (
            notifications.slice(0, 5).map((notification) => (
              <div key={notification.id} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="font-semibold text-white">{notification.title}</div>
                <div className="mt-1 text-sm leading-5 text-slate-300">{notification.message}</div>
              </div>
            ))
          ) : (
            <EmptyState text="No notifications yet." />
          )}
        </div>
      </section>
    </SettingsShell>
  );
}

export function LanguagePage() {
  const [language, setLanguage] = useState<LanguageCode>(() => readLanguage());

  const chooseLanguage = (nextLanguage: LanguageCode) => {
    setLanguage(nextLanguage);
    applyLanguagePreference(nextLanguage);
    toast.success(
      nextLanguage === "ar"
        ? "تم ضبط اللغة على العربية."
        : nextLanguage === "fr"
          ? "Language set to Francais."
          : "Language set to English."
    );
  };

  return (
    <SettingsShell title="Language" subtitle="display">
      <section className="neon-soft-panel grid gap-3 p-5">
        {[
          { id: "en" as const, label: "English" },
          { id: "fr" as const, label: "Francais" },
          { id: "ar" as const, label: "العربية" }
        ].map((option) => (
          <button
            key={option.id}
            className={`flex min-h-[58px] items-center justify-between rounded-[16px] border px-4 text-left transition ${
              language === option.id ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.04] text-white"
            }`}
            onClick={() => chooseLanguage(option.id)}
            type="button"
          >
            <span className="flex items-center gap-3 font-semibold">
              <Languages className="h-5 w-5" />
              {option.label}
            </span>
            {language === option.id ? <Check className="h-5 w-5" /> : <ChevronRight className="h-5 w-5 text-slate-500" />}
          </button>
        ))}
      </section>
    </SettingsShell>
  );
}

export function SupportPage() {
  const supportEmail = "support@fndk.capital";

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(supportEmail);
      toast.success("Support email copied.");
    } catch {
      toast.error("Could not copy support email.");
    }
  };

  return (
    <SettingsShell title="Help Center" subtitle="online service">
      <StatusCard
        icon={Headset}
        title="Online Service"
        description="Contact support for withdrawals, real-name verification, strategy reservations, and account access."
        action={
          <div className="grid grid-cols-2 gap-3">
            <a className="fndk-primary-action block" href={`mailto:${supportEmail}?subject=FNDK%20Support`}>
              Email support
            </a>
            <button className="fndk-secondary-action flex items-center justify-center gap-2" onClick={() => void copyEmail()} type="button">
              <Copy className="h-4 w-4" />
              Copy email
            </button>
          </div>
        }
      />
      <section className="neon-soft-panel mt-5 grid gap-3 p-5">
        {[
          ["Reservation did not continue", "Open Strategy and wait for the active countdown to finish, then launch the next reservation."],
          ["Withdrawal review", "Withdrawal requests enter the 72-hour review window before admin approval."],
          ["Real-name verification", "Upload a clear document photo and holding document photo in Security Center."]
        ].map(([title, description]) => (
          <div key={title} className="rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="font-semibold text-white">{title}</div>
            <div className="mt-1 text-sm leading-5 text-slate-300">{description}</div>
          </div>
        ))}
      </section>
    </SettingsShell>
  );
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadNotifications = async () => {
    const token = getToken();
    if (!token) {
      toast.error("Sign in first.");
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);
    try {
      const response = await notificationApi.get<unknown>("/notifications", { headers: authHeaders() });
      setNotifications(normalizeNotifications(response.data));
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not load notifications.", error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNotifications();
  }, []);

  const markRead = async (id?: string) => {
    setSaving(true);
    try {
      await notificationApi.patch("/notifications/read", id ? { id } : {}, { headers: authHeaders() });
      setNotifications((current) =>
        current.map((notification) => (id && notification.id !== id ? notification : { ...notification, isRead: true }))
      );
      toast.success(id ? "Notification marked as read." : "All notifications marked as read.");
    } catch (error) {
      toast.error(resolveApiErrorMessage("Could not update notifications.", error));
    } finally {
      setSaving(false);
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <SettingsShell title="Notifications" subtitle={`${unreadCount} unread`}>
      <StatusCard
        icon={Bell}
        title="Account notifications"
        description="Deposit approvals, withdrawal updates, profit credits, VIP changes, and admin messages appear here."
        action={
          <button className="fndk-primary-action w-full disabled:opacity-60" disabled={saving || unreadCount === 0} onClick={() => void markRead()} type="button">
            Mark all as read
          </button>
        }
      />
      <section className="mt-5 grid gap-3">
        {loading ? (
          <EmptyState text="Loading notifications..." />
        ) : notifications.length ? (
          notifications.map((notification) => (
            <article
              key={notification.id}
              className={`rounded-[20px] border px-4 py-4 ${
                notification.isRead ? "border-white/10 bg-white/[0.04]" : "border-cyan-300/30 bg-cyan-300/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[1rem] font-extrabold text-white">{notification.title}</div>
                  <div className="mt-1 text-sm leading-5 text-slate-300">{notification.message}</div>
                </div>
                {!notification.isRead ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300" /> : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{new Date(notification.createdAt).toLocaleString("en-GB")}</div>
                {!notification.isRead ? (
                  <button className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200" disabled={saving} onClick={() => void markRead(notification.id)} type="button">
                    Mark read
                  </button>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <EmptyState text="No notifications yet." />
        )}
      </section>
    </SettingsShell>
  );
}

export function SecurityOverviewPage() {
  return (
    <SettingsShell title="Security" subtitle="account protection">
      <section className="neon-soft-panel grid gap-3 p-5">
        {[
          { to: "/app/settings/withdrawal-address", label: "Withdrawal Address", icon: WalletCards },
          { to: "/app/profile", label: "Real-Name Verification", icon: ShieldCheck },
          { to: "/app/settings/phone", label: "Phone Number", icon: Phone },
          { to: "/app/settings/email", label: "Email", icon: Mail },
          { to: "/app/settings/login-password", label: "Login Password", icon: KeyRound }
        ].map(({ to, label, icon: Icon }) => (
          <Link key={to} className="flex min-h-[58px] items-center justify-between rounded-[16px] border border-white/10 bg-white/[0.04] px-4 text-white" to={to}>
            <span className="flex items-center gap-3 font-semibold">
              <Icon className="h-5 w-5 text-cyan-200" />
              {label}
            </span>
            <ChevronRight className="h-5 w-5 text-slate-500" />
          </Link>
        ))}
      </section>
    </SettingsShell>
  );
}
