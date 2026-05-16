import { ChangeEvent, useId, useState } from "react";
import { ChevronRight, FileText, ShieldCheck, Upload, UserRound } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile-page-header";

type UploadFieldProps = {
  title: string;
  description: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  fileName?: string;
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
        className="sr-only"
        id={inputId}
        onChange={onChange}
        type="file"
      />
    </div>
  );
}

export function ProfilePage() {
  const [documentFileName, setDocumentFileName] = useState<string>();
  const [selfieFileName, setSelfieFileName] = useState<string>();

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
            />

            <UploadField
              description="Passport, national ID, or driver&apos;s license"
              fileName={documentFileName}
              onChange={(event) => setDocumentFileName(event.target.files?.[0]?.name)}
              title="Upload ID document"
            />

            <UploadField
              description="Clear face photo with good lighting"
              fileName={selfieFileName}
              onChange={(event) => setSelfieFileName(event.target.files?.[0]?.name)}
              title="Upload selfie"
            />

            <button className="mt-1 w-full min-w-0 max-w-full rounded-[20px] bg-cyan-400 px-4 py-4 text-[15px] font-semibold text-slate-950">
              Submit KYC
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
