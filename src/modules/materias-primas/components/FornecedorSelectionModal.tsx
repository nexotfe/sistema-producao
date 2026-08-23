"use client";

import Link from "next/link";
import { useState } from "react";
import { useFornecedorSelection } from "../hooks/useFornecedorSelection";
import type { FornecedorSelecao } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (fornecedor: FornecedorSelecao) => Promise<boolean>;
  returnUrl: string;
};

export function FornecedorSelectionModal({
  open,
  onClose,
  onAdd,
  returnUrl,
}: Props) {
  const { fornecedores, busca, setBusca, loading, erro } =
    useFornecedorSelection();
  const [selecionado, setSelecionado] = useState<FornecedorSelecao | null>(null);
  const [salvando, setSalvando] = useState(false);

  if (!open) {
    return null;
  }

  async function handleAdd() {
    if (!selecionado) {
      return;
    }

    setSalvando(true);
    const sucesso = await onAdd(selecionado);
    setSalvando(false);

    if (sucesso) {
      setSelecionado(null);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Adicionar Fornecedor
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                Selecione um fornecedor existente para esta matéria-prima.
              </p>
            </div>

            <Link
              href={`/fornecedores/novo?retorno=${encodeURIComponent(
                returnUrl,
              )}`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Novo Fornecedor
            </Link>
          </div>
        </div>

        <div className="border-b border-border-subtle px-5 py-4">
          <label htmlFor="buscar-fornecedor" className="sr-only">
            Buscar fornecedor
          </label>
          <input
            id="buscar-fornecedor"
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar por razão social, nome fantasia ou CNPJ"
            className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-text-secondary">
              Carregando fornecedores...
            </p>
          ) : erro ? (
            <p className="py-8 text-center text-sm text-status-danger-text">{erro}</p>
          ) : fornecedores.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-secondary">
              Nenhum fornecedor encontrado.
            </p>
          ) : (
            <div className="divide-y divide-border-subtle rounded-md border border-border">
              {fornecedores.map((fornecedor) => {
                const ativo = selecionado?.id === fornecedor.id;

                return (
                  <button
                    key={fornecedor.id}
                    type="button"
                    onClick={() => setSelecionado(fornecedor)}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-border-subtle ${
                      ativo ? "bg-blue-50/60" : "bg-surface"
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-semibold text-text-primary">
                        {fornecedor.nome_fantasia ||
                          fornecedor.nome ||
                          "Fornecedor sem nome"}
                      </span>
                      <span className="mt-1 block text-xs text-text-secondary">
                        {[fornecedor.nome, fornecedor.cnpj]
                          .filter(Boolean)
                          .join(" | ") || "Dados complementares não informados"}
                      </span>
                    </span>

                    <span
                      className={`h-3 w-3 rounded-full border ${
                        ativo
                          ? "border-action-primary-hover bg-action-primary-hover"
                          : "border-border bg-surface-elevated"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-border px-3 text-sm font-semibold text-text-primary transition hover:bg-border-subtle"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!selecionado || salvando}
            className="h-10 rounded-md bg-action-primary-hover px-3 text-sm font-semibold text-action-primary-text transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
