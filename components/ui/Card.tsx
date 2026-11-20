import React from "react";

interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  variant?: "surface" | "alt" | "accent" | "highlight";
}

export function BentoCard({
  children,
  className = "",
  variant = "surface",
  ...props
}: BentoCardProps) {
  const variantStyles = {
    surface: "bg-signal-surface border-signal-hairline",
    alt: "bg-signal-surface-alt border-signal-hairline",
    accent: "bg-[#14130F] text-[#F1EFE6] dark:bg-[#F1EFE6] dark:text-[#14130F] border-transparent",
    highlight: "bg-signal-surface border-signal-lime/50 shadow-[0_0_15px_rgba(198,244,50,0.12)]",
  }[variant];

  return (
    <div
      className={`rounded-24 border p-6 transition-all duration-200 hover:-translate-y-0.5 ${variantStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function BentoHeader({
  title,
  subtitle,
  action,
  className = "",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold text-signal-ink tracking-tight">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-signal-muted mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
