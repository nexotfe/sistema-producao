"use client";

import { useState } from "react";

export type ItemParaEditar = {
  id: string;
  pn: string;
  descricao: string;
  quantidade: number;
};

type ResultadoEditarItem =
  | { status: "ok" }
  | { status: "erro"; mensagem: string };

type Props = {
  item: ItemParaEditar | null;
  onClose: () => void;
  onSave: (id: string, quantidade: number) => Promise<ResultadoEditarItem>;
};

export function EditarQuantidadeItemModal({ item, onClose, onSave }: Props) {
  if (!item) {
    return null;
  }

  return (
    <EditarQuantidadeItemModalConteudo
      key={`${item.id}:${item.quantidade}`}
      item={item}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

type ConteudoProps = {
  item: ItemParaEditar;
  onClose: () => void;
  onSave: Props["onSave"];
};

function EditarQuantidadeItemModalConteudo({
  item,
  onClose,
  onSave,
}: ConteudoProps) {
  const [quantidade, setQuantidade] = useState(String(item.quantidade));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function limparEFechar() {
    setErro(null);
    onClose();
  }

  async function handleSalvar() {
    const quantidadeNumerica = Number(quantidade.replace(",", "."));

    if (!Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0) {
      setErro("Informe uma quantidade numérica maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onSave(item.id, quantidadeNumerica);

    setSalvando(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    limparEFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Editar Item
          </h2>
        </div>

        <div className="px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Item
              </label>
              <div className="rounded-md border border-border-subtle bg-border-subtle px-3 py-2 text-sm text-text-primary">
                <span className="font-semibold">{item.pn}</span> —{" "}
                {item.descricao}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Quantidade
              </label>
              <input
                value={quantidade}
                onChange={(event) => setQuantidade(event.target.value)}
                inputMode="decimal"
                autoFocus
                className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {erro ? (
              <p className="text-sm font-medium text-status-danger-text">{erro}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <button
            type="button"
            onClick={limparEFechar}
            className="h-10 rounded-md border border-border px-3 text-sm font-semibold text-text-primary transition hover:bg-border-subtle"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="h-10 rounded-md bg-action-primary-hover px-3 text-sm font-semibold text-action-primary-text transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
