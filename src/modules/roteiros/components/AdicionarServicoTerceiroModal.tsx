"use client";

import { useState } from "react";
import type {
  NovoServicoTerceiroInput,
  OpcaoSelect,
  ResultadoOperacaoRoteiro,
} from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovoServicoTerceiroInput) => Promise<ResultadoOperacaoRoteiro>;
  fornecedoresDisponiveis: OpcaoSelect[];
};

export function AdicionarServicoTerceiroModal({
  open,
  onClose,
  onAdd,
  fornecedoresDisponiveis,
}: Props) {
  const [descricao, setDescricao] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [custoEstimado, setCustoEstimado] = useState("");
  const [prazoEstimadoDias, setPrazoEstimadoDias] = useState("");
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
    setPrazoEstimadoDias("");
    setObservacoes("");
    setErro(null);
    onClose();
  }

  async function handleAdicionar() {
    if (!descricao.trim()) {
      setErro("Informe a descrição do serviço.");
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

    const prazoNumerico =
      prazoEstimadoDias.trim() === "" ? null : Number(prazoEstimadoDias);

    if (prazoNumerico !== null && !Number.isInteger(prazoNumerico)) {
      setErro("Informe um prazo estimado (dias) numérico válido.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAdd({
      descricao,
      fornecedorId: fornecedorId || null,
      custoEstimado: custoNumerico,
      prazoEstimadoDias: prazoNumerico,
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
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Adicionar Serviço de Terceiro
          </h2>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Descrição
              </label>
              <input
                value={descricao}
                onChange={(event) => setDescricao(event.target.value)}
                className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Fornecedor
              </label>
              <select
                value={fornecedorId}
                onChange={(event) => setFornecedorId(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
              >
                <option value="">Não informado</option>
                {fornecedoresDisponiveis.map((fornecedor) => (
                  <option key={fornecedor.id} value={fornecedor.id}>
                    {fornecedor.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Custo estimado (R$)
                </label>
                <input
                  value={custoEstimado}
                  onChange={(event) => setCustoEstimado(event.target.value)}
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Prazo estimado (dias)
                </label>
                <input
                  value={prazoEstimadoDias}
                  onChange={(event) => setPrazoEstimadoDias(event.target.value)}
                  inputMode="numeric"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Observações
              </label>
              <textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                rows={3}
                className="w-full resize-y rounded-md border border-border px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
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
            onClick={handleAdicionar}
            disabled={salvando}
            className="h-10 rounded-md bg-action-primary-hover px-3 text-sm font-semibold text-action-primary-text transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Adicionando..." : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
