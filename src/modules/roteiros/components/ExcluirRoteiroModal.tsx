"use client";
// Confirmação de "Excluir roteiro" - clique simples não é suficiente
// (decisão de negócio confirmada): o administrador precisa digitar o
// código exato do produto para habilitar o botão de confirmação.
// Mesmo padrão key+montagem já usado em AdicionarMaterialModal.tsx/
// ListaTecnicaProjetoModal.tsx - sem useEffect para resetar estado.
import { useState } from "react";
import type { ResultadoOperacaoRoteiro } from "../types";
import { Button } from "@/modules/shared/ui/Button";

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
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Excluir roteiro
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Produto <span className="font-semibold">{codigoProduto}</span> —
            versão {versaoRoteiro}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <p className="text-sm leading-6 text-text-primary">
              Esta ação exclui logicamente este roteiro do uso atual,
              preservando seus dados para histórico.
            </p>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Para confirmar, digite o código do produto:{" "}
                <span className="font-mono text-text-primary">
                  {codigoProduto}
                </span>
              </label>
              <input
                value={textoDigitado}
                onChange={(event) => setTextoDigitado(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {erro ? (
              <p className="text-sm font-medium text-status-danger-text">{erro}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="danger-solid"
            onClick={handleConfirmar}
            disabled={!confirmacaoHabilitada || excluindo}
          >
            {excluindo ? "Excluindo..." : "Confirmar exclusão"}
          </Button>
        </div>
      </div>
    </div>
  );
}
