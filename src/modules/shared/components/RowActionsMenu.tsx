"use client";

import Link from "next/link";
import { Button } from "@/modules/shared/ui/Button";

type RowActionsMenuProps = {
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  ariaLabel: string;
  editarHref: string;
  duplicarHref?: string;
  /** Quando informado, "Duplicar" vira botão (dispara isto) em vez de link para duplicarHref. */
  onDuplicar?: () => void;
  ativo: boolean;
  onToggleAtivo: () => void;
  onExcluir?: () => void;
};

/**
 * Menu de acoes "kebab" (⋮) por linha - mesmo padrao visual usado em
 * Materias-Primas (/estoque/materias-primas).
 */
export function RowActionsMenu({
  aberto,
  onAbrir,
  onFechar,
  ariaLabel,
  editarHref,
  duplicarHref,
  onDuplicar,
  ativo,
  onToggleAtivo,
  onExcluir,
}: RowActionsMenuProps) {
  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        aria-label={ariaLabel}
        onClick={() => (aberto ? onFechar() : onAbrir())}
        className="text-lg leading-none"
      >
        {"⋮"}
      </Button>

      {aberto ? (
        <div className="absolute right-4 top-12 z-20 w-40 overflow-hidden rounded-lg border border-border bg-surface-elevated py-1 text-left shadow-xl">
          <Link
            href={editarHref}
            className="block px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-border-subtle"
          >
            Editar
          </Link>
          {onDuplicar ? (
            <button
              type="button"
              onClick={onDuplicar}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-text-primary transition hover:bg-border-subtle"
            >
              Duplicar
            </button>
          ) : duplicarHref ? (
            <Link
              href={duplicarHref}
              className="block px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-border-subtle"
            >
              Duplicar
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onToggleAtivo}
            className="block w-full px-3 py-2 text-left text-sm font-medium text-text-primary transition hover:bg-border-subtle"
          >
            {ativo ? "Inativar" : "Ativar"}
          </button>
          {onExcluir ? (
            <button
              type="button"
              onClick={onExcluir}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-status-danger-text transition hover:bg-status-danger-bg"
            >
              Excluir
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
