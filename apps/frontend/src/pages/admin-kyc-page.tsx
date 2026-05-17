import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { ExternalLink, RefreshCcw, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SectionCard } from "@/components/section-card";

const adminApi = axios.create({
  baseURL: import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:4006/api"
});

const identityApiBase = import.meta.env.VITE_IDENTITY_API_URL ?? "http://localhost:4001/api";
const identityUploadsBase = identityApiBase.replace(/\/api\/?$/, "");

type KycSubmission = {
  id: string;
  userId: string;
  fullName: string;
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

const statusTone: Record<KycSubmission["status"], string> = {
  pending: "text-amber-300",
  verified: "text-cyan-300",
  rejected: "text-rose-300"
};

const resolveKycUploadUrl = (url: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  return `${identityUploadsBase}${url}`;
};

export function AdminKycPage() {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminApiOffline, setAdminApiOffline] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const pendingKycCount = useMemo(
    () => submissions.filter((submission) => submission.status === "pending").length,
    [submissions]
  );

  const loadKycSubmissions = async () => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await adminApi.get<KycSubmission[]>("/admin/kyc", {
        headers: { Authorization: `Bearer ${token}` }
      });

      setAdminApiOffline(false);
      setSubmissions(response.data);
    } catch (error) {
      if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
        localStorage.removeItem("nevo.accessToken");
        localStorage.removeItem("nevo.refreshToken");
        localStorage.removeItem("nevo.user");
        setAdminApiOffline(false);
        toast.error("Your admin session expired. Sign in again.");
        navigate("/login", { replace: true });
        return;
      }

      setAdminApiOffline(true);
      toast.error("Admin KYC service is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }

    loadedRef.current = true;
    void loadKycSubmissions();
  }, []);

  const reviewKyc = async (submissionId: string, status: "verified" | "rejected") => {
    const token = localStorage.getItem("nevo.accessToken");
    if (!token) {
      toast.error("Sign in as admin first.");
      return;
    }

    let adminNote: string | undefined;
    if (status === "rejected") {
      const note = window.prompt("Optional rejection note");
      if (note === null) {
        return;
      }

      adminNote = note.trim() || undefined;
    }

    setActionId(submissionId);
    try {
      await adminApi.patch(
        `/admin/kyc/${submissionId}/review`,
        adminNote ? { status, adminNote } : { status },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      toast.success(status === "verified" ? "KYC approved." : "KYC rejected.");
      await loadKycSubmissions();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const responseMessage = error.response?.data?.message;
        toast.error(typeof responseMessage === "string" ? responseMessage : "Could not review KYC.");
      } else {
        toast.error("Could not review KYC.");
      }
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="grid gap-6">
      <SectionCard
        action={
          <button
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200"
            disabled={loading}
            onClick={() => void loadKycSubmissions()}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        }
        title="KYC Review"
        subtitle={`Review uploaded identity files. Pending: ${pendingKycCount}`}
      >
        {adminApiOffline ? (
          <div className="mb-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            Live KYC data is unavailable because `admin-service` is not responding on `localhost:4006`.
          </div>
        ) : null}

        {submissions.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {submissions.map((submission) => (
              <div key={submission.id} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-white">{submission.fullName}</div>
                    <div className="mt-1 text-sm text-slate-400">
                      {submission.documentType ?? "government-id"} - {new Date(submission.submittedAt).toLocaleString("en-GB")}
                    </div>
                  </div>
                  <div className={`text-sm font-medium uppercase tracking-[0.18em] ${statusTone[submission.status]}`}>
                    {submission.status}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between gap-4">
                    <span>Submission ID</span>
                    <span className="max-w-[60%] truncate text-right text-white">{submission.id}</span>
                  </div>
                  {submission.firstName || submission.lastName || submission.nationality || submission.documentNumber ? (
                    <div className="rounded-2xl border border-white/10 bg-[#06083e] px-3 py-3 text-sm text-slate-300">
                      <div className="font-semibold text-white">
                        {[submission.firstName, submission.lastName].filter(Boolean).join(" ") || "Real-name details"}
                      </div>
                      <div className="mt-1">
                        {submission.nationality ? `${submission.nationality} - ` : ""}
                        {submission.documentNumber ?? "No document number"}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <a
                      className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
                      href={resolveKycUploadUrl(submission.documentUrl)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View ID document
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <a
                      className="inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200"
                      href={resolveKycUploadUrl(submission.selfieUrl)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      View selfie
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                  {submission.adminNote ? (
                    <div className="rounded-2xl border border-white/10 bg-[#06083e] px-3 py-3 text-sm text-slate-300">
                      Admin note: {submission.adminNote}
                    </div>
                  ) : null}
                </div>

                {submission.status === "pending" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      className="inline-flex items-center gap-2 rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
                      disabled={actionId === submission.id}
                      onClick={() => void reviewKyc(submission.id, "verified")}
                      type="button"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      {actionId === submission.id ? "Working..." : "Approve"}
                    </button>
                    <button
                      className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-200 disabled:opacity-60"
                      disabled={actionId === submission.id}
                      onClick={() => void reviewKyc(submission.id, "rejected")}
                      type="button"
                    >
                      {actionId === submission.id ? "Working..." : "Reject"}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-slate-400">
            {loading ? "Loading KYC submissions..." : "No KYC submissions available."}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
