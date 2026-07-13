"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

import { EmptyState } from "@/modules/clientes/components/EmptyState";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { LoadingState } from "@/modules/clientes/components/LoadingState";
import { StatusBadge } from "@/modules/clientes/components/StatusBadge";
import { RowActionsMenu } from "@/modules/shared/components/RowActionsMenu";
import { ExclusaoBloqueadaBanner } from "@/modules/shared/components/ExclusaoBloqueadaBanner";
import type { ResultadoExclusao } from "@/modules/shared/data/excluirRegistro";
import type { ColunasRecursos, RecursoProdutivo } from "../types";

type RecursosTableProps = {
  recursos: RecursoProdutivo[];
  loading: boolean;
  erro: string | null;
  busca: string;
  colunasVisiveis: ColunasRecursos;
  alternarAtivoRecurso: (id: string, ativoAtual: boolean) => Promise<void>;
  excluirRecurso: (id: string) => Promise<ResultadoExclusao>;
};

export function RecursosTable({
  recursos,
  loading,
  erro,
  busca,
  colunasVisiveis,
  alternarAtivoRecurso,
  excluirRecurso,
}: RecursosTableProps) {
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<{
    id: string;
    status: "vinculado" | "sem_permissao";
  } | null>(null);

  async function handleExcluir(id: string) {
    const confirmado = window.confirm(
      "Deseja excluir permanentemente este recurso? Essa ação não pode ser desfeita.",
    );

    if (!confirmado) {
      return;
    }

    setMenuAbertoId(null);
    setBloqueio(null);
    const resultado = await excluirRecurso(id);

    if (resultado.status === "vinculado" || resultado.status === "sem_permissao") {
      setBloqueio({ id, status: resultado.status });
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-app-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <div>
          <Link
            href="/recursos/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Cadastro de Recursos Produtivos
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"›"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Consulte e gerencie os recursos utilizados pela operacao industrial.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState titulo="Falha ao carregar" descricao={erro} />
      ) : recursos.length === 0 ? (
        <EmptyState
          titulo="Nenhum recurso encontrado"
          descricao={
            busca
              ? "Ajuste a busca para localizar outro cadastro."
              : "Os recursos cadastrados aparecerao aqui."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {colunasVisiveis.codigo && <Th>Codigo</Th>}
                {colunasVisiveis.nome && <Th>Nome</Th>}
                {colunasVisiveis.grupo && <Th>Grupo</Th>}
                {colunasVisiveis.valorHora && <Th>Valor Hora</Th>}
                {colunasVisiveis.setor && <Th>Setor</Th>}
                {colunasVisiveis.capacidade && <Th>Capacidade</Th>}
                {colunasVisiveis.status && <Th>Status</Th>}
                <Th>{""}</Th>
              </tr>
            </thead>

            <tbody>
              {recursos.map((recurso) => (
                <Fragment key={recurso.id}>
                  <tr className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80">
                    {colunasVisiveis.codigo && (
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600">
                        {recurso.codigo || "Nao informado"}
                      </td>
                    )}

                    {colunasVisiveis.nome && (
                      <td className="px-5 py-3">
                        <EntityLink
                          type="recurso"
                          id={recurso.id}
                          className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                        >
                          {recurso.nome || "Recurso sem nome"}
                        </EntityLink>
                        {[recurso.fabricante, recurso.modelo].filter(Boolean)
                          .length > 0 ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {[recurso.fabricante, recurso.modelo]
                              .filter(Boolean)
                              .join(" / ")}
                          </p>
                        ) : null}
                      </td>
                    )}

                    {colunasVisiveis.grupo && (
                      <td className="px-5 py-3 text-sm text-slate-600">
                        {recurso.grupo?.nome || "Nao informado"}
                      </td>
                    )}

                    {colunasVisiveis.valorHora && (
                      <td className="px-5 py-3 text-sm text-slate-600">
                        {formatValorHora(recurso.valor_hora)}
                      </td>
                    )}

                    {colunasVisiveis.setor && (
                      <td className="px-5 py-3 text-sm text-slate-600">
                        {recurso.setor || "Nao informado"}
                      </td>
                    )}

                    {colunasVisiveis.capacidade && (
                      <td className="px-5 py-3 text-sm text-slate-600">
                        {formatNumero(recurso.capacidade)}
                      </td>
                    )}

                    {colunasVisiveis.status && (
                      <td className="px-5 py-3">
                        <StatusBadge ativo={Boolean(recurso.ativo)} />
                      </td>
                    )}

                    <td className="relative px-5 py-3 text-right">
                      <RowActionsMenu
                        aberto={menuAbertoId === recurso.id}
                        onAbrir={() => setMenuAbertoId(recurso.id)}
                        onFechar={() => setMenuAbertoId(null)}
                        ariaLabel={`Abrir ações de ${recurso.nome}`}
                        editarHref={`/recursos/${recurso.id}/editar`}
                        duplicarHref={`/recursos/novo?duplicar=${recurso.id}`}
                        ativo={Boolean(recurso.ativo)}
                        onToggleAtivo={() => {
                          setMenuAbertoId(null);
                          alternarAtivoRecurso(
                            recurso.id,
                            Boolean(recurso.ativo),
                          );
                        }}
                        onExcluir={() => handleExcluir(recurso.id)}
                      />
                    </td>
                  </tr>

                  {bloqueio?.id === recurso.id ? (
                    <tr key={`${recurso.id}-bloqueio`}>
                      <td
                        colSpan={
                          Object.values(colunasVisiveis).filter(Boolean).length +
                          1
                        }
                      >
                        <ExclusaoBloqueadaBanner
                          status={bloqueio.status}
                          onDesativar={() => {
                            setBloqueio(null);
                            alternarAtivoRecurso(recurso.id, true);
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </th>
  );
}

function formatNumero(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Nao informada";
  }

  return value.toLocaleString("pt-BR");
}

function formatValorHora(value: number | null | undefined) {
  const valor = value ?? 0;

  return `${valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })}/h`;
}
