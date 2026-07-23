import { useId, type SelectHTMLAttributes } from "react";

type SelectOption = {
  value: string;
  label: string;
};

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  options: SelectOption[];
  placeholder?: string;
};

export function Select({
  label,
  options,
  placeholder,
  id,
  className,
  disabled,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-[7px]">
      <label
        htmlFor={selectId}
        className="text-[12.5px] font-semibold text-text-primary"
      >
        {label}
      </label>

      <select
        id={selectId}
        disabled={disabled}
        className={[
          "h-[42px] w-full rounded-[10px] border px-[13px] text-[13.5px] text-text-primary outline-none transition",
          "focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring",
          disabled
            ? "cursor-not-allowed border-border-subtle bg-border-subtle text-text-disabled"
            : "border-border bg-surface-elevated",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
