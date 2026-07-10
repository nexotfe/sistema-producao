"use client";

import { useState } from "react";
import { unidadesBomItem } from "../types";
import type {
  NovoSubconjuntoInput,
  OpcaoSelect,
  ResultadoOperacaoRoteiro,
} from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovoSubconjuntoInput) => Promise<ResultadoOperacaoRoteiro>;
  produtosDisponiveis: OpcaoSelect[];
};

export function AdicionarSubconjuntoModal({
  open,
  onClose,
  onAdd,
  produtosDisponiveis,
}: Props) {
  const [componenteProdutoId, setComponenteProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("peca");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setComponenteProdutoId("");
    setQuantidade("");
    setUnidade("peca");
    setObservacoes("");
    setErro(null);
    onClose();
  }

  async function handleAdicionar() {
    if (!componenteProdutoId) {
      setErro("Selecione o produto do subconjunto.");
      return;
    }

    const quantidadeNumerica = Number(quantidade.replace(",", "."));

    if (!Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0) {
      setErro("Informe uma quantidade numérica maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAdd({
      componenteProdutoId,
      quantidade: quantidadeNumerica,
      unidade,
      observacoes,
    });

    setSalvando(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    limparEFechar();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Adicionar Subconjunto
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Vincule um produto já cadastrado como subconjunto deste roteiro.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Produto
              </label>
              <select
                value={componenteProdutoId}
                onChange={(event) => setComponenteProdutoId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione</option>
                {produtosDisponiveis.map((produto) => (
                  <option key={produto.id} value={produto.id}>
                    {produto.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Quantidade
                </label>
                <input
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Unidade
                </label>
                <select
                  value={unidade}
                  onChange={(event) => setUnidade(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  {unidadesBomItem.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Observações
              </label>
              <textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                rows={3}
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
            onClick={handleAdicionar}
            disabled={salvando}
            className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
