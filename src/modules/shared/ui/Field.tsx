import { useId, type InputHTMLAttributes } from "react";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export function Field({
  label,
  error,
  hint,
  id,
  className,
  disabled,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-[7px]">
      <label
        htmlFor={inputId}
        className="text-[12.5px] font-semibold text-text-primary"
      >
        {label}
      </label>

      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={[
          "h-[42px] w-full rounded-[10px] border px-[13px] text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled",
          "focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring",
          error
            ? "border-status-danger-border ring-[3px] ring-status-danger-bg"
            : "border-border bg-surface-elevated",
          disabled
            ? "cursor-not-allowed border-border-subtle bg-border-subtle text-text-disabled"
            : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />

      {error ? (
        <span className="text-[11.5px] text-status-danger-text">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-text-secondary">{hint}</span>
      ) : null}
    </div>
  );
}
