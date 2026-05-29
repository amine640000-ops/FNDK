import type { PropsWithChildren, ReactNode } from "react";
import { translateText, useAppLanguage } from "@/lib/i18n";

type SectionCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}>;

export function SectionCard({ title, subtitle, action, className = "", children }: SectionCardProps) {
  const language = useAppLanguage();

  return (
    <section className={`glass-panel min-w-0 p-6 ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">{translateText(language, title)}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-400">{translateText(language, subtitle)}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
