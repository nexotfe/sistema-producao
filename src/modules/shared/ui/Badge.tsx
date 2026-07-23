import type { ReactNode } from "react";

export type BadgeVariant = "success" | "neutral" | "warning" | "danger";

type BadgeProps = {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
};

const variantClasses: Record<BadgeVariant, string> = {
  success:
    "text-status-success-text bg-status-success-bg border-status-success-border",
  warning:
    "text-status-warning-text bg-status-warning-bg border-status-warning-border",
  danger:
    "text-status-danger-text bg-status-danger-bg border-status-danger-border",
  neutral: "text-text-secondary bg-border-subtle border-border",
};

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-[11px] py-1 text-[11.5px] font-semibold",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
