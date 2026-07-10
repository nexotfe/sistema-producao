"use client";

import { useState } from "react";
import type { ResultadoAjusteEstoque } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  onAjustar: (
    saldoReal: number,
    justificativa: string,
  ) => Promise<ResultadoAjusteEstoque>;
  saldoAtual: number;
};

export function AjustarEstoqueModal({
  open,
  onClose,
  onAjustar,
  saldoAtual,
}: Props) {
  const [saldoReal, setSaldoReal] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setSaldoReal("");
    setJustificativa("");
    setErro(null);
    onClose();
  }

  async function handleAjustar() {
    const saldoNumerico = Number(saldoReal.trim().replace(",", "."));

    if (!Number.isFinite(saldoNumerico) || saldoNumerico < 0) {
      setErro("Informe um saldo real numérico maior ou igual a zero.");
      return;
    }

    if (!justificativa.trim()) {
      setErro("Informe a justificativa do ajuste.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = await onAjustar(saldoNumerico, justificativa);

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
            Ajustar Estoque
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Saldo atual: {saldoAtual.toLocaleString("pt-BR")}. Ação restrita a
            administradores.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Saldo Real Contado
              </label>
              <input
                value={saldoReal}
                onChange={(event) => setSaldoReal(event.target.value)}
                inputMode="decimal"
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Justificativa
              </label>
              <textarea
                value={justificativa}
                onChange={(event) => setJustificativa(event.target.value)}
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
            onClick={handleAjustar}
            disabled={salvando}
            className="h-10 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando ? "Ajustando..." : "Ajustar"}
          </button>
        </div>
      </div>
    </div>
  );
}
