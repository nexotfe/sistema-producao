import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const baseClasses =
  "inline-flex h-10 items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "px-[18px] bg-action-primary text-action-primary-text hover:bg-action-primary-hover",
  secondary:
    "px-[18px] border border-border bg-surface text-text-primary hover:bg-border-subtle",
  ghost: "px-2 bg-transparent text-action-primary hover:bg-status-info-bg",
  danger:
    "px-[18px] border border-status-danger-border bg-transparent text-status-danger-text hover:bg-status-danger-bg",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={[baseClasses, variantClasses[variant], className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
