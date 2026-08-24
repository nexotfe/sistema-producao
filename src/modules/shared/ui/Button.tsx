import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-solid"
  | "success"
  | "warning";

export type ButtonSize = "default" | "icon";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const baseClasses =
  "inline-flex items-center justify-center gap-1.5 rounded-[10px] text-[13.5px] font-semibold transition focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50";

// Cor/estado por variante - nunca inclui altura/padding (isso é papel de
// sizeClasses), para as duas dimensões (variante x tamanho) combinarem
// livremente sem um sobrescrever a outra via ordem de classe do Tailwind
// (que não é confiável para isso).
const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-action-primary text-action-primary-text hover:bg-action-primary-hover",
  secondary:
    "border border-border bg-surface text-text-primary hover:bg-border-subtle",
  ghost:
    "bg-transparent text-action-primary hover:bg-status-info-bg hover:underline",
  danger:
    "border border-status-danger-border bg-transparent text-status-danger-text hover:bg-status-danger-bg",
  // As três variantes abaixo são preenchimento sólido. Usam tokens
  // dedicados (-solid-bg/-solid-hover, fixos - não reagem ao tema) em vez
  // do tom "-text" de cada família de status: o "-text" foi calibrado
  // para texto sobre fundo translúcido (badges/avisos), e no modo escuro
  // fica claro demais para hospedar texto branco por cima com contraste
  // aceitável. Reservadas para quando a cor comunica o significado real
  // (perigo/sucesso/cautela), nunca por preferência estética.
  "danger-solid":
    "bg-status-danger-solid-bg text-action-primary-text hover:bg-status-danger-solid-hover",
  success:
    "bg-status-success-solid-bg text-action-primary-text hover:bg-status-success-solid-hover",
  warning:
    "bg-status-warning-solid-bg text-action-primary-text hover:bg-status-warning-solid-hover",
};

// Altura/padding "default" preservam exatamente o que cada variante já
// tinha antes do tamanho "icon" existir (ghost sempre foi mais compacto,
// as demais sempre teve px-[18px]) - nenhuma mudança visual nos
// consumidores atuais, que nunca passam a prop size.
const defaultSizeByVariant: Record<ButtonVariant, string> = {
  primary: "h-10 px-[18px]",
  secondary: "h-10 px-[18px]",
  ghost: "h-10 px-2",
  danger: "h-10 px-[18px]",
  "danger-solid": "h-10 px-[18px]",
  success: "h-10 px-[18px]",
  warning: "h-10 px-[18px]",
};

const iconSizeClasses = "h-10 w-10 p-0";

/**
 * Fonte única das classes de botão - usada pelo <Button> e por qualquer
 * elemento com APARÊNCIA de botão que não pode ser um <button> de verdade
 * (ex.: <Link> de navegação real, onde trocar para onClick descaracterizaria
 * o link). Nunca duplicar esta combinação de classes à mão em outro lugar -
 * é exatamente a duplicação que a Fase 1d existe para eliminar.
 */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "default",
  className?: string,
): string {
  return [
    baseClasses,
    variantClasses[variant],
    size === "icon" ? iconSizeClasses : defaultSizeByVariant[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  size = "default",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={buttonClassName(variant, size, className)}
    />
  );
}
