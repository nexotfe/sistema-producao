"use client";
// Confirmação de "Excluir roteiro" - clique simples não é suficiente
// (decisão de negócio confirmada): o administrador precisa digitar o
// código exato do produto para habilitar o botão de confirmação.
// Mesmo padrão key+montagem já usado em AdicionarMaterialModal.tsx/
// ListaTecnicaProjetoModal.tsx - sem useEffect para resetar estado.
import { useState } from "react";
import type { ResultadoOperacaoRoteiro } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  codigoProduto: string;
  versaoRoteiro: string;
  onConfirmar: () => Promise<ResultadoOperacaoRoteiro>;
  onSucesso: () => void;
};

export function ExcluirRoteiroModal({
  open,
  onClose,
  codigoProduto,
  versaoRoteiro,
  onConfirmar,
  onSucesso,
}: Props) {
  if (!open) {
    return null;
  }

  return (
    <ExcluirRoteiroModalConteudo
      key={codigoProduto}
      onClose={onClose}
      codigoProduto={codigoProduto}
      versaoRoteiro={versaoRoteiro}
      onConfirmar={onConfirmar}
      onSucesso={onSucesso}
    />
  );
}

type ConteudoProps = {
  onClose: () => void;
  codigoProduto: string;
  versaoRoteiro: string;
  onConfirmar: () => Promise<ResultadoOperacaoRoteiro>;
  onSucesso: () => void;
};

function ExcluirRoteiroModalConteudo({
  onClose,
  codigoProduto,
  versaoRoteiro,
  onConfirmar,
  onSucesso,
}: ConteudoProps) {
  const [textoDigitado, setTextoDigitado] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const confirmacaoHabilitada = textoDigitado.trim() === codigoProduto;

  async function handleConfirmar() {
    if (!confirmacaoHabilitada) {
      return;
    }

    setExcluindo(true);
    setErro(null);

    const resultado = await onConfirmar();

    setExcluindo(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    onSucesso();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-slate-200 bg-app-card shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Excluir roteiro
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Produto <span className="font-semibold">{codigoProduto}</span> —
            versão {versaoRoteiro}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-slate-700">
              Esta ação exclui logicamente este roteiro do uso atual,
              preservando seus dados para histórico.
            </p>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Para confirmar, digite o código do produto:{" "}
                <span className="font-mono text-slate-800">
                  {codigoProduto}
                </span>
              </label>
              <input
                value={textoDigitado}
                onChange={(event) => setTextoDigitado(event.target.value)}
                autoComplete="off"
                spellCheck={false}
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
            onClick={onClose}
            className="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={!confirmacaoHabilitada || excluindo}
            className="h-10 rounded-md bg-red-600 px-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {excluindo ? "Excluindo..." : "Confirmar exclusão"}
          </button>
        </div>
      </div>
    </div>
  );
}
