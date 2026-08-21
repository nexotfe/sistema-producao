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
      {/*
        Label e hint são texto comum, não widget nativo do navegador -
        seguem os tokens REATIVOS do Design System (text-text-primary/
        text-text-secondary), porque estão sobre o fundo do Card/página
        ao redor, que também é reativo (bg-surface etc.) e escurece no
        modo escuro. Texto fixo-claro aqui ficaria invisível sobre um
        fundo de Card escuro - foi exatamente esse o bug do teste manual.
      */}
      <label htmlFor={inputId} className="text-[12.5px] font-semibold text-text-primary">
        {label}
      </label>

      {/*
        O <input> em si é diferente: cores FIXAS (slate/blue/red), nunca
        reativas. color-scheme fica travado em "light" para o app inteiro
        (ver comentário em globals.css) até os campos nativos serem
        migrados - o ícone nativo do seletor de data é desenhado pelo
        navegador conforme color-scheme:light (sempre claro), então o
        fundo do próprio <input> precisa continuar claro para o ícone não
        ficar ilegível/invisível sobre o campo. Mesma categoria de token
        "fixo" que já existe para brand-header-fixed (PAD-006 §3.1),
        aplicada aqui a um campo nativo em vez de identidade de marca.
      */}
      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={[
          "h-[42px] w-full rounded-[10px] border px-[13px] text-[13.5px] text-slate-900 outline-none transition placeholder:text-slate-400",
          "focus-visible:border-blue-600 focus-visible:ring-[3px] focus-visible:ring-blue-400/40",
          error ? "border-red-200 ring-[3px] ring-red-50" : "border-slate-200 bg-white",
          disabled ? "cursor-not-allowed border-slate-100 bg-slate-100 text-slate-400" : "",
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
