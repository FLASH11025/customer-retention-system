import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center font-medium tracking-tight rounded-16 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";

  const variants = {
    primary:
      "bg-signal-ink text-signal-bg dark:bg-signal-lime dark:text-[#14130F] hover:opacity-90 shadow-sm",
    secondary:
      "bg-signal-surface border border-signal-hairline text-signal-ink hover:bg-signal-surface-alt",
    outline:
      "border border-signal-hairline bg-transparent text-signal-ink hover:border-signal-muted",
    ghost: "bg-transparent text-signal-muted hover:text-signal-ink hover:bg-signal-hairline/20",
    danger:
      "bg-signal-danger text-white hover:bg-signal-danger/90 border-transparent shadow-sm",
  }[variant];

  const sizes = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2.5 gap-2",
    lg: "text-base px-6 py-3.5 gap-2.5 font-semibold",
  }[size];

  return (
    <button
      className={`${base} ${variants} ${sizes} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
      {icon && <span className="inline-block shrink-0">{icon}</span>}
    </button>
  );
}
