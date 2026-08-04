"use client";

import Link from "next/link";

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
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => (aberto ? onFechar() : onAbrir())}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-lg font-semibold leading-none text-slate-600 transition hover:bg-slate-50"
      >
        {"⋮"}
      </button>

      {aberto ? (
        <div className="absolute right-4 top-12 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-app-card py-1 text-left shadow-xl">
          <Link
            href={editarHref}
            className="block px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Editar
          </Link>
          {onDuplicar ? (
            <button
              type="button"
              onClick={onDuplicar}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Duplicar
            </button>
          ) : duplicarHref ? (
            <Link
              href={duplicarHref}
              className="block px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Duplicar
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onToggleAtivo}
            className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {ativo ? "Inativar" : "Ativar"}
          </button>
          {onExcluir ? (
            <button
              type="button"
              onClick={onExcluir}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              Excluir
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
