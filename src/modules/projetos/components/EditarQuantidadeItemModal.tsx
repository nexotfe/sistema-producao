"use client";

import { useEffect, useState } from "react";

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
  const [quantidade, setQuantidade] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setQuantidade(String(item.quantidade));
      setErro(null);
    }
  }, [item]);

  if (!item) {
    return null;
  }

  function limparEFechar() {
    setErro(null);
    onClose();
  }

  async function handleSalvar() {
    if (!item) {
      return;
    }

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
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-md border border-slate-200 bg-app-card shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Editar Item
          </h2>
        </div>

        <div className="px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Item
              </label>
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <span className="font-semibold">{item.pn}</span> —{" "}
                {item.descricao}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Quantidade
              </label>
              <input
                value={quantidade}
                onChange={(event) => setQuantidade(event.target.value)}
                inputMode="decimal"
                autoFocus
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {erro ? (
              <p className="text-sm font-medium text-red-600">{erro}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={limparEFechar}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
