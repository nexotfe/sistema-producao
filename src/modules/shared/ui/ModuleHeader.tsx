import type { ReactNode } from "react";

type ModuleHeaderProps = {
  /**
   * String simples (caso comum) recebe o <h1> padrao automaticamente.
   * ReactNode (ex.: nome + badge de status na mesma linha) e renderizado
   * como veio - o chamador inclui seu proprio <h1> com as classes
   * corretas dentro do conteudo, para casos que fogem do texto simples.
   */
  title: ReactNode;
  subtitle?: string;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  themeToggle?: ReactNode;
  backButton?: ReactNode;
  className?: string;
  /**
   * "plain" (padrao) - layout claro, aprovado no Item 1, para telas de
   * Detalhe/Editar. "brand" - reproduz a faixa escura de marca ja
   * existente em producao (logo + titulo a esquerda, acoes a direita,
   * tudo numa linha so) - usa o token FIXO brand-header-fixed
   * (PAD-006 secao 3.1), nao reage a tema.
   */
  variant?: "plain" | "brand";
};

/**
 * Cabecalho compartilhado, configuravel via props (PAD-006/PAD-007).
 * Nao renderiza Button/etc diretamente - e um slot de composicao:
 * quem consome preenche backButton/actions/themeToggle com os
 * primitivos da Fase 2. themeToggle vive aqui provisoriamente por nao
 * existir shell global (ver PAD-006).
 */
export function ModuleHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  children,
  themeToggle,
  backButton,
  className,
  variant = "plain",
}: ModuleHeaderProps) {
  if (variant === "brand") {
    return (
      <header
        className={[
          "rounded-t-lg border-x border-t border-border bg-brand-header-fixed px-5 py-4 -mb-6",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/5 text-xs font-bold text-slate-300">
              LOGO
            </div>

            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
                {title}
              </h1>

              {subtitle ? (
                <p className="mt-1 text-sm text-slate-300">{subtitle}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {actions}

            {backButton || themeToggle ? (
              <div className="flex flex-wrap items-center gap-2">
                {backButton}
                {themeToggle}
              </div>
            ) : null}
          </div>
        </div>

        {children}
      </header>
    );
  }

  return (
    <header
      className={["flex flex-col gap-3", className].filter(Boolean).join(" ")}
    >
      {backButton || breadcrumbs ? (
        <div className="flex items-center justify-between gap-3">
          {backButton}
          {breadcrumbs}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            {typeof title === "string" ? (
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                {title}
              </h1>
            ) : (
              title
            )}
          </div>

          {subtitle ? (
            <p className="mt-2 text-sm text-text-secondary">{subtitle}</p>
          ) : null}
        </div>

        {actions || themeToggle ? (
          <div className="flex flex-wrap items-center gap-3">
            {actions}
            {themeToggle}
          </div>
        ) : null}
      </div>

      {children}
    </header>
  );
}
