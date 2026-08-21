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
      {/* Label é texto comum, segue os tokens reativos - mesmo raciocínio de Field.tsx. */}
      <label
        htmlFor={selectId}
        className="text-[12.5px] font-semibold text-text-primary"
      >
        {label}
      </label>

      {/*
        O <select> em si usa cores FIXAS, nunca reativas: a seta nativa
        do dropdown é desenhada pelo navegador conforme color-scheme:light
        (fixo no app inteiro, ver globals.css) - um fundo reativo que
        escurece no modo escuro deixaria essa seta ilegível sobre o
        próprio campo. Mesma correção já aplicada e aprovada em Field.tsx.
      */}
      <select
        id={selectId}
        disabled={disabled}
        className={[
          "h-[42px] w-full rounded-[10px] border px-[13px] text-[13.5px] text-slate-900 outline-none transition",
          "focus-visible:border-blue-600 focus-visible:ring-[3px] focus-visible:ring-blue-400/40",
          disabled
            ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400"
            : "border-slate-200 bg-white",
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
