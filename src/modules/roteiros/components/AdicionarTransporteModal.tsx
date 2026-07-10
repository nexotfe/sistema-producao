"use client";

import { useState } from "react";
import type {
  NovoTransporteInput,
  OpcaoSelect,
  ResultadoOperacaoRoteiro,
} from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovoTransporteInput) => Promise<ResultadoOperacaoRoteiro>;
  fornecedoresDisponiveis: OpcaoSelect[];
};

export function AdicionarTransporteModal({
  open,
  onClose,
  onAdd,
  fornecedoresDisponiveis,
}: Props) {
  const [descricao, setDescricao] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [custoEstimado, setCustoEstimado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setDescricao("");
    setFornecedorId("");
    setCustoEstimado("");
    setObservacoes("");
    setErro(null);
    onClose();
  }

  async function handleAdicionar() {
    if (!descricao.trim()) {
      setErro("Informe a descrição do transporte.");
      return;
    }

    const custoNumerico =
      custoEstimado.trim() === ""
        ? null
        : Number(custoEstimado.replace(",", "."));

    if (custoNumerico !== null && !Number.isFinite(custoNumerico)) {
      setErro("Informe um custo estimado numérico válido.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAdd({
      descricao,
      fornecedorId: fornecedorId || null,
      custoEstimado: custoNumerico,
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
            Adicionar Transporte
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Descrição
              </label>
              <input
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Transportadora / Fornecedor
              </label>
              <select
                value={fornecedorId}
                onChange={(event) => setFornecedorId(event.target.value)}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Não informado</option>
                {fornecedoresDisponiveis.map((fornecedor) => (
                  <option key={fornecedor.id} value={fornecedor.id}>
                    {fornecedor.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Custo estimado (R$)
              </label>
              <input
                value={custoEstimado}
                onChange={(event) => setCustoEstimado(event.target.value)}
                inputMode="decimal"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
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
