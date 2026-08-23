"use client";

import { useState } from "react";
import { unidadesBomItem } from "../types";
import type {
  BomItemMateriaPrima,
  NovoBomItemInput,
  ResultadoOperacaoRoteiro,
} from "../types";
import {
  MateriaPrimaSearchInput,
  type MateriaPrimaResumo,
} from "./MateriaPrimaSearchInput";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovoBomItemInput) => Promise<ResultadoOperacaoRoteiro>;
  onEdit: (
    id: string,
    input: NovoBomItemInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  materialEditando: BomItemMateriaPrima | null;
};

export function AdicionarMaterialModal({
  open,
  onClose,
  onAdd,
  onEdit,
  materialEditando,
}: Props) {
  if (!open) {
    return null;
  }

  // key=materialEditando?.id: cada abertura (adicionar, ou editar um
  // material diferente) monta uma instância nova do conteúdo - o
  // estado nasce já com os valores corretos direto no useState, sem
  // precisar de um efeito para sincronizar/resetar estado a cada
  // abertura (mesmo padrão de ListaTecnicaProjetoModal.tsx).
  return (
    <AdicionarMaterialModalConteudo
      key={materialEditando?.id ?? "novo"}
      onClose={onClose}
      onAdd={onAdd}
      onEdit={onEdit}
      materialEditando={materialEditando}
    />
  );
}

type ConteudoProps = {
  onClose: () => void;
  onAdd: (input: NovoBomItemInput) => Promise<ResultadoOperacaoRoteiro>;
  onEdit: (
    id: string,
    input: NovoBomItemInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  materialEditando: BomItemMateriaPrima | null;
};

function AdicionarMaterialModalConteudo({
  onClose,
  onAdd,
  onEdit,
  materialEditando,
}: ConteudoProps) {
  const [materiaPrima, setMateriaPrima] = useState<MateriaPrimaResumo | null>(
    null,
  );
  const [unidadeEdicao, setUnidadeEdicao] = useState(
    materialEditando?.unidade ?? "",
  );
  const [quantidade, setQuantidade] = useState(
    materialEditando ? String(materialEditando.quantidade) : "",
  );
  const [dimensoes, setDimensoes] = useState(
    materialEditando?.dimensoes ?? "",
  );
  const [observacoes, setObservacoes] = useState(
    materialEditando?.observacoes ?? "",
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const unidade = materialEditando
    ? unidadeEdicao
    : (materiaPrima?.unidade ?? "");
  const unidadeLabel =
    unidadesBomItem.find((opcao) => opcao.value === unidade)?.label ??
    unidade;

  async function handleAdicionar() {
    if (!materialEditando && !materiaPrima) {
      setErro("Selecione a matéria-prima.");
      return;
    }

    if (materialEditando && !unidadeEdicao) {
      setErro("Selecione a unidade.");
      return;
    }

    const quantidadeNumerica = Number(quantidade.replace(",", "."));

    if (!Number.isFinite(quantidadeNumerica) || quantidadeNumerica <= 0) {
      setErro("Informe uma quantidade numérica maior que zero.");
      return;
    }

    setSalvando(true);
    setErro(null);

    const resultado = materialEditando
      ? await onEdit(materialEditando.id, {
          materiaPrimaId: materialEditando.materiaPrimaId,
          quantidade: quantidadeNumerica,
          unidade: unidadeEdicao,
          dimensoes,
          observacoes,
        })
      : await onAdd({
          materiaPrimaId: materiaPrima!.id,
          quantidade: quantidadeNumerica,
          unidade,
          dimensoes,
          observacoes,
        });

    setSalvando(false);

    if (resultado.status === "erro") {
      setErro(resultado.mensagem);
      return;
    }

    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-md border border-border bg-surface shadow-xl">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {materialEditando ? "Editar material" : "Adicionar Material"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {materialEditando
              ? "Corrija quantidade, unidade, dimensões e observações. Para trocar a matéria-prima vinculada, remova e adicione novamente."
              : "Vincule uma matéria-prima já cadastrada a este roteiro."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Matéria-prima
              </label>
              {materialEditando ? (
                <div className="flex h-10 w-full items-center rounded-md border border-border-subtle bg-border-subtle px-3 text-sm text-text-primary">
                  {materialEditando.descricao}
                </div>
              ) : (
                <MateriaPrimaSearchInput
                  value={materiaPrima}
                  onChange={setMateriaPrima}
                />
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                Dimensões
              </label>
              <input
                value={dimensoes}
                onChange={(event) => setDimensoes(event.target.value)}
                placeholder="Ex: 1000x1000mm"
                className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
              />
              <p className="mt-1.5 text-xs text-text-disabled">
                Referência da medida de origem. Não entra no cálculo de
                custo.
              </p>
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
                {materialEditando ? (
                  <select
                    value={unidadeEdicao}
                    onChange={(event) => setUnidadeEdicao(event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                  >
                    {unidadesBomItem.map((opcao) => (
                      <option key={opcao.value} value={opcao.value}>
                        {opcao.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-10 w-full items-center rounded-md border border-border-subtle bg-border-subtle px-3 text-sm text-text-secondary">
                    {unidadeLabel || "Selecione a matéria-prima"}
                  </div>
                )}
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
            onClick={onClose}
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
            {materialEditando
              ? salvando
                ? "Salvando..."
                : "Salvar"
              : salvando
                ? "Adicionando..."
                : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
