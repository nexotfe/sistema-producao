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
        O <input> usa tokens REATIVOS de cor (fundo/texto/borda) desde a
        Fase 1b do modo escuro. O ícone nativo do seletor de data (que
        antes exigia manter este campo sempre claro) agora é resolvido em
        globals.css: color-scheme fica escopado a input/select/textarea,
        então o navegador já desenha esse ícone em tom escuro quando o
        tema é escuro - não precisa mais travar o fundo do campo em claro.
      */}
      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={[
          "h-[42px] w-full rounded-[10px] border bg-surface-elevated px-[13px] text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled",
          "focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring",
          error ? "border-status-danger-border ring-[3px] ring-status-danger-bg" : "border-border",
          disabled ? "cursor-not-allowed border-border-subtle bg-border-subtle text-text-disabled" : "",
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
