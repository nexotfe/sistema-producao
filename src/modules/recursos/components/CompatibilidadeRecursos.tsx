"use client";

import { useState } from "react";
import { Card } from "@/modules/shared/ui/Card";
import { Button } from "@/modules/shared/ui/Button";
import { Select } from "@/modules/shared/ui/Select";
import { useCompatibilidadesRecurso } from "../hooks/useCompatibilidadesRecurso";

type Props = {
  recursoOrigemId: string;
};

/**
 * Secao de Compatibilidade entre Recursos Produtivos, dentro da tela
 * de Editar Recurso (Fase 5, Item 11). Estrutura ja validada por
 * mockup: lista ordenada por prioridade, setas subir/descer, remover
 * (soft delete via ativo=false), adicionar via dropdown, estado vazio,
 * texto de contexto (frase-ancora ja documentada na arquitetura).
 */
export function CompatibilidadeRecursos({ recursoOrigemId }: Props) {
  const {
    origemLabel,
    compatibilidades,
    opcoesDisponiveis,
    loading,
    processando,
    erro,
    adicionar,
    mover,
    remover,
  } = useCompatibilidadesRecurso(recursoOrigemId);

  const [selecionado, setSelecionado] = useState("");

  async function handleAdicionar() {
    if (!selecionado) {
      return;
    }

    const sucesso = await adicionar(selecionado);

    if (sucesso) {
      setSelecionado("");
    }
  }

  return (
    <Card title="Compatibilidade entre Recursos Produtivos">
      <div className="flex flex-col gap-4">
        <p className="text-xs leading-5 text-text-secondary">
          Se este recurso estiver sem capacidade disponível, a Simulação de
          Capacidade tentará os recursos abaixo, nesta ordem. Não altera o
          roteiro nem o recurso originalmente planejado — e não vale ao
          contrário: os recursos listados aqui não passam a aceitar{" "}
          {origemLabel || "este recurso"} como substituto automaticamente.
        </p>

        {loading ? (
          <p className="text-sm text-text-secondary">
            Carregando compatibilidades...
          </p>
        ) : compatibilidades.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Nenhum recurso compatível cadastrado — se este recurso ficar sem
            capacidade, a operação entra em déficit.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {compatibilidades.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-[10px] border border-border bg-surface-elevated px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-border-subtle text-xs font-semibold text-text-secondary">
                  {index + 1}
                </span>

                <span className="flex-1 text-sm text-text-primary">
                  {[item.destinoCodigo, item.destinoNome]
                    .filter(Boolean)
                    .join(" — ")}
                </span>

                <button
                  type="button"
                  onClick={() => mover(item.id, "cima")}
                  disabled={processando || index === 0}
                  aria-label="Mover para cima"
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-border text-text-secondary transition hover:bg-border-subtle disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↑
                </button>

                <button
                  type="button"
                  onClick={() => mover(item.id, "baixo")}
                  disabled={processando || index === compatibilidades.length - 1}
                  aria-label="Mover para baixo"
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-border text-text-secondary transition hover:bg-border-subtle disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ↓
                </button>

                <Button
                  variant="danger"
                  onClick={() => remover(item.id)}
                  disabled={processando}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ol>
        )}

        {!loading && opcoesDisponiveis.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Select
                label="Adicionar recurso compatível"
                value={selecionado}
                onChange={(event) => setSelecionado(event.target.value)}
                disabled={processando}
                placeholder="Selecione"
                options={opcoesDisponiveis.map((recurso) => ({
                  value: recurso.id,
                  label: [recurso.codigo, recurso.nome]
                    .filter(Boolean)
                    .join(" - "),
                }))}
              />
            </div>

            <Button
              variant="secondary"
              onClick={handleAdicionar}
              disabled={!selecionado || processando}
            >
              Adicionar
            </Button>
          </div>
        ) : null}

        {erro ? (
          <p className="text-sm font-medium text-status-danger-text">
            {erro}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
