"use client";

import { useState } from "react";
import type {
  BomOperacao,
  NovaOperacaoInput,
  OpcaoSelect,
  ResultadoOperacaoRoteiro,
} from "../types";
import { Button } from "@/modules/shared/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onAdd: (input: NovaOperacaoInput) => Promise<ResultadoOperacaoRoteiro>;
  onEdit: (
    id: string,
    input: NovaOperacaoInput,
  ) => Promise<ResultadoOperacaoRoteiro>;
  recursosDisponiveis: OpcaoSelect[];
  proximaOrdem: number;
  operacaoEditando: BomOperacao | null;
};

export function AdicionarOperacaoModal({ open, ...props }: Props) {
  if (!open) {
    return null;
  }

  return (
    <AdicionarOperacaoModalConteudo
      key={props.operacaoEditando?.id ?? "novo"}
      {...props}
    />
  );
}

type ConteudoProps = Omit<Props, "open">;

function AdicionarOperacaoModalConteudo({
  onClose,
  onAdd,
  onEdit,
  recursosDisponiveis,
  proximaOrdem,
  operacaoEditando,
}: ConteudoProps) {
  const [ordem, setOrdem] = useState(
    String(operacaoEditando ? operacaoEditando.ordem : proximaOrdem),
  );
  const [descricao, setDescricao] = useState(
    operacaoEditando?.descricao ?? "",
  );
  const [recursoProdutivoId, setRecursoProdutivoId] = useState(
    operacaoEditando?.recursoProdutivoId ?? "",
  );
  const [tipo, setTipo] = useState<"engenharia" | "producao">(
    operacaoEditando?.tipo ?? "producao",
  );
  const [tempoEstimadoMinutos, setTempoEstimadoMinutos] = useState(
    operacaoEditando ? String(operacaoEditando.tempoEstimadoMinutos) : "",
  );
  const [observacoes, setObservacoes] = useState(
    operacaoEditando?.observacoes ?? "",
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function limparEFechar() {
    setDescricao("");
    setRecursoProdutivoId("");
    setTipo("producao");
    setTempoEstimadoMinutos("");
    setObservacoes("");
    setErro(null);
    onClose();
  }

  async function handleSalvar() {
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

    const input: NovaOperacaoInput = {
      ordem: ordemNumerica,
      descricao,
      recursoProdutivoId,
      tipo,
      tempoEstimadoMinutos: tempoNumerico,
      observacoes,
    };

    const resultado = operacaoEditando
      ? await onEdit(operacaoEditando.id, input)
      : await onAdd(input);

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
            {operacaoEditando ? "Editar OP" : "Adicionar OP"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            A ordem é única dentro de todo o roteiro (Engenharia e Operações
            compartilham a mesma numeração).
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Ordem (OP)
                </label>
                <input
                  value={ordem}
                  onChange={(event) => setOrdem(event.target.value)}
                  inputMode="numeric"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Tempo estimado (min)
                </label>
                <input
                  value={tempoEstimadoMinutos}
                  onChange={(event) => setTempoEstimadoMinutos(event.target.value)}
                  inputMode="decimal"
                  className="h-10 w-full rounded-md border border-border px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                />
              </div>
            </div>

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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Recurso aplicado
                </label>
                <select
                  value={recursoProdutivoId}
                  onChange={(event) => setRecursoProdutivoId(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
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
                <label className="mb-1.5 block text-xs font-semibold text-text-secondary">
                  Tipo
                </label>
                <select
                  value={tipo}
                  onChange={(event) =>
                    setTipo(event.target.value as "engenharia" | "producao")
                  }
                  className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition focus:border-action-primary focus:ring-2 focus:ring-focus-ring"
                >
                  <option value="producao">Produção / Mão de obra</option>
                  <option value="engenharia">Engenharia</option>
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
          <Button onClick={handleSalvar} disabled={salvando}>
            {operacaoEditando
              ? salvando
                ? "Salvando..."
                : "Salvar"
              : salvando
                ? "Adicionando..."
                : "Adicionar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
