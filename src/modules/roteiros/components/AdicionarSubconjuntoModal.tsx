"use client";

import { useState } from "react";
import { unidadesBomItem } from "../types";
import { ProdutoSubconjuntoSearchInput, type ProdutoSubconjuntoResumo } from "./ProdutoSubconjuntoSearchInput";
import type { NovoSubconjuntoInput, ResultadoOperacaoRoteiro } from "../types";
import { Button } from "@/modules/shared/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovoSubconjuntoInput) => Promise<ResultadoOperacaoRoteiro>;
  produtoAtualId: string;
};

export function AdicionarSubconjuntoModal({
  open,
  onClose,
  onAdd,
  produtoAtualId,
}: Props) {
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoSubconjuntoResumo | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [unidade, setUnidade] = useState("peca");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function limparEFechar() {
    setProdutoSelecionado(null);
    setQuantidade("");
    setUnidade("peca");
    setObservacoes("");
    setErro(null);
    onClose();
  }

  async function handleAdicionar() {
    if (!produtoSelecionado) {
      setErro("Selecione o produto do subconjunto.");
      return;
    }

    if (!produtoSelecionado.temBom) {
      setErro("Este produto não tem roteiro cadastrado e não pode ser usado como subconjunto.");
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
      componenteProdutoId: produtoSelecionado.id,
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
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            Montar Subconjunto
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Vincule um produto já cadastrado como subconjunto deste roteiro.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Produto
              </label>
              <ProdutoSubconjuntoSearchInput
                value={produtoSelecionado}
                onChange={setProdutoSelecionado}
                produtoAtualId={produtoAtualId}
                placeholder="Buscar produto por código ou descrição"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Quantidade
                </label>
                <input
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Unidade
                </label>
                <select
                  value={unidade}
                  onChange={(event) => setUnidade(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
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
          <Button variant="secondary" onClick={limparEFechar}>
            Cancelar
          </Button>
          <Button onClick={handleAdicionar} disabled={salvando}>
            {salvando ? "Adicionando..." : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
