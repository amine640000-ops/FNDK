type FndkLogoProps = {
  className?: string;
};

export function FndkLogo({ className = "" }: FndkLogoProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M52 142 256 23l85 51-202 117-3 231-85-47 1-233Z" />
      <path d="m220 235 205-116 39 24v229L260 489l-41-23 167-95V241L220 334v-99Z" />
    </svg>
  );
}

type BrandMarkProps = {
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
};

export function BrandMark({
  className = "",
  iconClassName = "",
  textClassName = "",
  subtitle,
  subtitleClassName = ""
}: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-2 shadow-[0_0_20px_rgba(104,232,255,0.22)] ${iconClassName}`}
      >
        <FndkLogo className="h-full w-full text-cyan-300 drop-shadow-[0_0_12px_rgba(103,232,249,0.35)]" />
      </span>
      <span className="min-w-0">
        <span className={`block font-extrabold text-cyan-100 ${textClassName || "text-2xl tracking-[0.12em]"}`}>
          FNDK
        </span>
        {subtitle ? (
          <span
            className={`block text-[11px] uppercase tracking-[0.32em] text-cyan-300/70 ${subtitleClassName}`}
          >
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
