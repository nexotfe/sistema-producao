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
import type {
  ColunasGruposRecursos,
  GrupoRecursoProdutivo,
} from "../types";

type GruposRecursosTableProps = {
  grupos: GrupoRecursoProdutivo[];
  loading: boolean;
  erro: string | null;
  busca: string;
  colunasVisiveis: ColunasGruposRecursos;
  alternarAtivoGrupo: (id: string, ativoAtual: boolean) => Promise<void>;
  excluirGrupo: (id: string) => Promise<ResultadoExclusao>;
};

export function GruposRecursosTable({
  grupos,
  loading,
  erro,
  busca,
  colunasVisiveis,
  alternarAtivoGrupo,
  excluirGrupo,
}: GruposRecursosTableProps) {
  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [bloqueio, setBloqueio] = useState<{
    id: string;
    status: "vinculado" | "sem_permissao";
  } | null>(null);

  async function handleExcluir(id: string) {
    const confirmado = window.confirm(
      "Deseja excluir permanentemente este grupo de recursos? Essa ação não pode ser desfeita.",
    );

    if (!confirmado) {
      return;
    }

    setMenuAbertoId(null);
    setBloqueio(null);
    const resultado = await excluirGrupo(id);

    if (resultado.status === "vinculado" || resultado.status === "sem_permissao") {
      setBloqueio({ id, status: resultado.status });
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-app-card">
      <div className="border-b border-slate-100 px-5 py-4">
        <div>
          <Link
            href="/grupos-recursos/novo"
            className="inline-flex w-fit items-center rounded-sm text-base font-semibold text-slate-900 outline-none transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2"
          >
            Cadastro de Grupos de Recursos
            <span
              aria-hidden="true"
              className="ml-2 text-base font-semibold leading-none"
            >
              {"›"}
            </span>
          </Link>

          <p className="mt-1 text-sm text-slate-500">
            Consulte e gerencie as familias produtivas da operacao industrial.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : erro ? (
        <EmptyState titulo="Falha ao carregar" descricao={erro} />
      ) : grupos.length === 0 ? (
        <EmptyState
          titulo="Nenhum grupo encontrado"
          descricao={
            busca
              ? "Ajuste a busca para localizar outro cadastro."
              : "Os grupos cadastrados aparecerao aqui."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left">
                {colunasVisiveis.codigo && <Th>Codigo</Th>}
                {colunasVisiveis.nome && <Th>Nome</Th>}
                {colunasVisiveis.unidade && <Th>Unidade</Th>}
                {colunasVisiveis.status && <Th>Status</Th>}
                <Th>{""}</Th>
              </tr>
            </thead>

            <tbody>
              {grupos.map((grupo) => (
                <Fragment key={grupo.id}>
                  <tr className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80">
                    {colunasVisiveis.codigo && (
                      <td className="px-5 py-3 text-sm text-slate-600">
                        {grupo.codigo || "Nao informado"}
                      </td>
                    )}

                    {colunasVisiveis.nome && (
                      <td className="px-5 py-3">
                        <EntityLink
                          type="grupoRecurso"
                          id={grupo.id}
                          className="text-sm font-semibold text-slate-900 transition hover:text-slate-600"
                        >
                          {grupo.nome || "Grupo sem nome"}
                        </EntityLink>
                        {grupo.descricao ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {grupo.descricao}
                          </p>
                        ) : null}
                      </td>
                    )}

                    {colunasVisiveis.unidade && (
                      <td className="px-5 py-3 text-sm text-slate-600">
                        {grupo.unidade_capacidade || "Nao informada"}
                      </td>
                    )}

                    {colunasVisiveis.status && (
                      <td className="px-5 py-3">
                        <StatusBadge ativo={Boolean(grupo.ativo)} />
                      </td>
                    )}

                    <td className="relative px-5 py-3 text-right">
                      <RowActionsMenu
                        aberto={menuAbertoId === grupo.id}
                        onAbrir={() => setMenuAbertoId(grupo.id)}
                        onFechar={() => setMenuAbertoId(null)}
                        ariaLabel={`Abrir ações de ${grupo.nome}`}
                        editarHref={`/grupos-recursos/${grupo.id}/editar`}
                        duplicarHref="/grupos-recursos/novo"
                        ativo={Boolean(grupo.ativo)}
                        onToggleAtivo={() => {
                          setMenuAbertoId(null);
                          alternarAtivoGrupo(grupo.id, Boolean(grupo.ativo));
                        }}
                        onExcluir={() => handleExcluir(grupo.id)}
                      />
                    </td>
                  </tr>

                  {bloqueio?.id === grupo.id ? (
                    <tr key={`${grupo.id}-bloqueio`}>
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
                            alternarAtivoGrupo(grupo.id, true);
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
