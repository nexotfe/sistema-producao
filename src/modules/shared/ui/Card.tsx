import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Versao unica do Card (PAD-007 secao 2.1/4). Absorve as duas familias
 * visuais divergentes hoje (Detalhe/Editar vs. Novo). Sem hover de
 * proposito - Card nao e um elemento interativo.
 */
export function Card({ title, children, className }: CardProps) {
  return (
    <div
      className={["overflow-hidden rounded-xl border border-border bg-surface", className]
        .filter(Boolean)
        .join(" ")}
    >
      {title ? (
        <div className="border-b border-border-subtle px-[22px] py-[18px]">
          <h3 className="text-[15px] font-semibold text-text-primary">
            {title}
          </h3>
        </div>
      ) : null}

      <div className="px-[22px] py-5">{children}</div>
    </div>
  );
}
