"use client";

import { useEffect, useState } from "react";
import type {
  NovaOperacaoInput,
  OpcaoSelect,
  ResultadoOperacaoRoteiro,
} from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovaOperacaoInput) => Promise<ResultadoOperacaoRoteiro>;
  recursosDisponiveis: OpcaoSelect[];
  proximaOrdem: number;
};

export function AdicionarOperacaoModal({
  open,
  onClose,
  onAdd,
  recursosDisponiveis,
  proximaOrdem,
}: Props) {
  const [ordem, setOrdem] = useState(String(proximaOrdem));
  const [descricao, setDescricao] = useState("");
  const [recursoProdutivoId, setRecursoProdutivoId] = useState("");
  const [tipo, setTipo] = useState<"engenharia" | "producao">("producao");
  const [tempoEstimadoMinutos, setTempoEstimadoMinutos] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOrdem(String(proximaOrdem));
    }
  }, [open, proximaOrdem]);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setDescricao("");
    setRecursoProdutivoId("");
    setTipo("producao");
    setTempoEstimadoMinutos("");
    setObservacoes("");
    setErro(null);
    onClose();
  }

  async function handleAdicionar() {
    const ordemNumerica = Number(ordem);

    if (!Number.isInteger(ordemNumerica) || ordemNumerica <= 0) {
      setErro("Informe uma ordem numérica válida.");
      return;
    }

    if (!descricao.trim()) {
      setErro("Informe a descrição da operação.");
      return;
    }

    if (!recursoProdutivoId) {
      setErro("Selecione o recurso aplicado.");
      return;
    }

    const tempoNumerico = Number(tempoEstimadoMinutos.replace(",", "."));

    if (!Number.isFinite(tempoNumerico) || tempoNumerico <= 0) {
      setErro("Informe um tempo estimado (min) maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAdd({
      ordem: ordemNumerica,
      descricao,
      recursoProdutivoId,
      tipo,
      tempoEstimadoMinutos: tempoNumerico,
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
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-slate-200 bg-app-card shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Adicionar OP
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            A ordem é única dentro de todo o roteiro (Engenharia e Operações
            compartilham a mesma numeração).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Ordem (OP)
                </label>
                <input
                  value={ordem}
                  onChange={(event) => setOrdem(event.target.value)}
                  inputMode="numeric"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Tempo estimado (min)
                </label>
                <input
                  value={tempoEstimadoMinutos}
                  onChange={(event) => setTempoEstimadoMinutos(event.target.value)}
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Recurso aplicado
                </label>
                <select
                  value={recursoProdutivoId}
                  onChange={(event) => setRecursoProdutivoId(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Selecione</option>
                  {recursosDisponiveis.map((recurso) => (
                    <option key={recurso.id} value={recurso.id}>
                      {recurso.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Tipo
                </label>
                <select
                  value={tipo}
                  onChange={(event) =>
                    setTipo(event.target.value as "engenharia" | "producao")
                  }
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="producao">Produção / Mão de obra</option>
                  <option value="engenharia">Engenharia</option>
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
