"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { consultarProgramacaoVigentePcpAction } from "@/modules/pcp/actions/consultarProgramacaoVigentePcpAction";
import {
  construirProgramacaoPorRecursoEDia,
  type ProgramacaoPorRecursoEDia,
} from "@/modules/pcp/lib/construirProgramacaoPorRecursoEDia";
import { decidirDesatualizacaoProgramacaoPcp } from "@/modules/pcp/lib/interpretacao/decidirDesatualizacaoProgramacaoPcp";

const currentUser = "Flavio Evangelista";

// Status do CÁLCULO do Motor (status_calculo_motor) - nunca o estado real
// de execução da OP (isso pertence a outra camada, Z/of_apontamentos).
// Rótulos e cores deliberadamente distintos dos antigos "situationStyles"
// para nunca dar a impressão de que isto é progresso de produção real.
const statusCalculoStyles = {
  concluida: { label: "Programada", className: "bg-blue-50 text-blue-700 ring-blue-200" },
  bloqueada_por_deficit: { label: "Bloqueada (déficit de capacidade)", className: "bg-rose-50 text-rose-700 ring-rose-200" },
  bloqueada_por_predecessora: { label: "Bloqueada (aguarda predecessora)", className: "bg-amber-50 text-amber-700 ring-amber-200" },
} as const;

type EstadoCarregamento =
  | { tipo: "carregando" }
  | { tipo: "nao_autenticado" }
  | { tipo: "nao_autorizado" }
  | { tipo: "falha_tecnica"; mensagem: string }
  | { tipo: "sem_programacao_vigente" }
  | { tipo: "ok"; programacao: ProgramacaoPorRecursoEDia; desatualizada: boolean };

const TODOS_OS_RECURSOS = "todos";

export default function DailySchedulePage() {
  const [estado, setEstado] = useState<EstadoCarregamento>({ tipo: "carregando" });
  const [printDate] = useState(() => new Date().toLocaleDateString("pt-BR"));
  // Filtro de recurso para a tela/impressão (Etapa 2I) - NUNCA refaz a
  // consulta nem a ordenação: só decide quais grupos, do mesmo array já
  // calculado e já ordenado, ficam visíveis. Tela e impressão sempre
  // mostram exatamente o mesmo subconjunto, na mesma ordem.
  const [recursoSelecionado, setRecursoSelecionado] = useState<string>(TODOS_OS_RECURSOS);

  useEffect(() => {
    let isMounted = true;

    async function carregarProgramacaoVigente() {
      let resultado: Awaited<ReturnType<typeof consultarProgramacaoVigentePcpAction>>;
      try {
        resultado = await consultarProgramacaoVigentePcpAction();
      } catch (erro) {
        // Falha TÉCNICA (rede, RLS mal configurada, etc.) - nunca
        // apresentada como "nenhuma programação vigente", que é uma
        // ausência LEGÍTIMA de dado, semanticamente diferente.
        if (isMounted) {
          setEstado({
            tipo: "falha_tecnica",
            mensagem: erro instanceof Error ? erro.message : "Falha desconhecida ao consultar a programação vigente.",
          });
        }
        return;
      }

      if (!isMounted) return;

      if (!resultado.ok) {
        setEstado({ tipo: resultado.motivo === "nao_autenticado" ? "nao_autenticado" : "nao_autorizado" });
        return;
      }

      if (resultado.programacao === null) {
        setEstado({ tipo: "sem_programacao_vigente" });
        return;
      }

      const programacaoTransformada = construirProgramacaoPorRecursoEDia(resultado.programacao);
      // construirProgramacaoPorRecursoEDia só devolve null quando a
      // entrada é null - já descartado pelo check acima.
      if (programacaoTransformada === null) {
        setEstado({ tipo: "sem_programacao_vigente" });
        return;
      }

      const desatualizada =
        decidirDesatualizacaoProgramacaoPcp({
          versaoOrigem: resultado.programacao.empresaCapacidadeVersaoOrigem,
          versaoAtual: resultado.programacao.versaoCapacidadeAtual,
        }) === "vigente_desatualizada";

      setEstado({ tipo: "ok", programacao: programacaoTransformada, desatualizada });
    }

    carregarProgramacaoVigente();

    return () => {
      isMounted = false;
    };
  }, []);

  function handlePrint() {
    window.print();
  }

  // Mesmo array já calculado e já ordenado por
  // construirProgramacaoPorRecursoEDia - o filtro de recurso só decide
  // visibilidade (tela e impressão), nunca refaz consulta nem ordenação.
  const gruposVisiveis =
    estado.tipo === "ok"
      ? recursoSelecionado === TODOS_OS_RECURSOS
        ? estado.programacao.grupos
        : estado.programacao.grupos.filter((grupo) => grupo.recursoId === recursoSelecionado)
      : [];

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary print:bg-white print:px-0 print:py-0 sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5 print:hidden">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
            <p className="text-sm font-semibold">{currentUser}</p>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">
                PCP
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
                Programação Diária — PCP
              </h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_auto_auto] sm:items-center">
              <label htmlFor="recurso-impressao" className="sr-only">
                Recurso para exibir/imprimir
              </label>
              <select
                id="recurso-impressao"
                value={recursoSelecionado}
                onChange={(event) => setRecursoSelecionado(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              >
                <option value={TODOS_OS_RECURSOS}>Todos os recursos</option>
                {estado.tipo === "ok"
                  ? Array.from(
                      new Map(
                        estado.programacao.grupos.map((grupo) => [grupo.recursoId, grupo.nomeRecurso ?? grupo.recursoId]),
                      ),
                    ).map(([recursoId, nome]) => (
                      <option key={recursoId} value={recursoId}>
                        {nome}
                      </option>
                    ))
                  : null}
              </select>
              <button
                onClick={handlePrint}
                className="h-11 rounded-md bg-action-primary-hover px-4 text-sm font-semibold text-action-primary-text transition hover:bg-blue-800"
              >
                Imprimir
              </button>
            </div>
          </div>

          <nav aria-label="Navegacao PCP" className="flex flex-wrap gap-2">
            <Link
              href="/pcp/planejamento"
              className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Planejamento PCP
            </Link>
            <Link
              href="/pcp/programacao-diaria"
              className="rounded-md bg-action-primary-hover px-3 py-2 text-xs font-semibold text-action-primary-text"
            >
              Programacao diaria
            </Link>
          </nav>
        </header>

        <section className="rounded-lg border border-border bg-surface print:rounded-none print:border-0">
          <div className="hidden border-b border-slate-300 px-5 py-4 print:block">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {estado.tipo === "ok" ? estado.programacao.nomeEmpresa : "NEXOTFE - PCP"}
            </p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-950">
                  Programação Diária — PCP
                </h1>
                <p className="mt-1 text-xs text-slate-600">
                  Impresso em {printDate || "__/__/____"} - Emitido por {currentUser}
                  {estado.tipo === "ok"
                    ? ` - Período ${estado.programacao.janelaInicio} a ${estado.programacao.janelaFim} - Programação vigente nº ${estado.programacao.versaoSequencial}`
                    : null}
                </p>
              </div>
            </div>
          </div>

          <div className="border-b border-border-subtle px-5 py-4 print:hidden">
            <p className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled print:block">
              PCP
            </p>
            <h2 className="text-base font-semibold text-text-primary">
              Programacao diaria por recurso e OP
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Reflete a programação vigente calculada e aprovada pelo PCP - a ordem exibida dentro do
              mesmo dia/recurso é só uma ordenação de apresentação (ver legenda ao final), nunca a
              sequência oficial de execução dentro do expediente.
            </p>
            {estado.tipo === "ok" ? (
              <p className="mt-1 text-xs text-text-disabled">
                {estado.programacao.nomeEmpresa} - Período {estado.programacao.janelaInicio} a{" "}
                {estado.programacao.janelaFim} - Programação vigente nº {estado.programacao.versaoSequencial}
              </p>
            ) : null}

            {estado.tipo === "nao_autenticado" ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Sessão não autenticada - faça login novamente para ver a programação.
              </p>
            ) : null}
            {estado.tipo === "nao_autorizado" ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Você não tem a permissão pcp.visualizar_programacao necessária para ver esta tela.
              </p>
            ) : null}
            {estado.tipo === "falha_tecnica" ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Falha técnica ao consultar a programação vigente: {estado.mensagem}
              </p>
            ) : null}
            {estado.tipo === "ok" && estado.desatualizada ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Esta programação vigente está desatualizada em relação à capacidade atual - um novo
                cálculo ainda não foi aprovado.
              </p>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm print:min-w-0 print:text-[11px]">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs font-semibold uppercase tracking-[0.16em] text-text-disabled print:border-slate-300 print:bg-white print:text-[10px] print:text-slate-700">
                <tr>
                  <th className="px-5 py-3 print:hidden">Recurso / Data</th>
                  <th className="px-5 py-3 print:px-2 print:py-2">Prioridade (PCP)</th>
                  <th className="px-5 py-3 print:px-2 print:py-2">Projeto</th>
                  <th className="px-5 py-3 print:px-2 print:py-2">OF</th>
                  <th className="px-5 py-3 print:px-2 print:py-2">OP</th>
                  <th className="px-5 py-3 print:px-2 print:py-2">Natureza</th>
                  <th className="px-5 py-3 print:px-2 print:py-2">Horas padrão</th>
                  <th className="px-5 py-3 print:hidden">Status do cálculo</th>
                  <th className="px-5 py-3 print:hidden">Ordem (apresentação)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle print:divide-slate-200">
                {estado.tipo === "carregando" ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm text-text-secondary print:py-6">
                      Carregando programacao diaria...
                    </td>
                  </tr>
                ) : estado.tipo === "sem_programacao_vigente" ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-8 text-center text-sm text-text-secondary print:py-6">
                      Nenhuma programação vigente foi calculada e aprovada ainda para esta empresa.
                    </td>
                  </tr>
                ) : estado.tipo === "ok" ? (
                  gruposVisiveis.length > 0 ? (
                    gruposVisiveis.map((grupo, indiceGrupo) => {
                      // Separação por recurso na impressão (Etapa 2L.2):
                      // quebra de página só quando o recurso muda em
                      // relação ao grupo anterior - nunca antes do
                      // primeiro grupo, nunca reordena nem recalcula nada,
                      // só decide onde a folha física vira.
                      const recursoMudou =
                        indiceGrupo > 0 && gruposVisiveis[indiceGrupo - 1].recursoId !== grupo.recursoId;
                      return (
                      <Fragment key={`${grupo.data}__${grupo.recursoId}`}>
                        <tr className={`bg-border-subtle print:bg-white ${recursoMudou ? "print:break-before-page" : ""}`}>
                          <td
                            colSpan={9}
                            className="px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary print:border-y print:border-slate-300 print:px-2 print:py-1 print:text-[10px] print:text-slate-800"
                          >
                            {grupo.nomeRecurso ?? "Recurso sem nome cadastrado"} — {grupo.data} —{" "}
                            {grupo.itens.length} OP{grupo.itens.length > 1 ? "s" : ""}
                          </td>
                        </tr>
                        {grupo.itens.map((item) => (
                          <tr
                            key={`${item.opId}-${item.data}-${item.recursoId}-${item.natureza}`}
                            className="transition hover:bg-border-subtle print:break-inside-avoid print:hover:bg-white"
                          >
                            <td className="px-5 py-4 print:hidden" />
                            <td className="px-5 py-4 tabular-nums print:px-2 print:py-2">
                              <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-border-subtle bg-border-subtle text-xs font-semibold tabular-nums text-text-primary print:h-auto print:w-auto print:border-0 print:bg-transparent print:p-0 print:text-slate-950">
                                {item.prioridadeUsada}
                              </span>
                            </td>
                            <td className="px-5 py-4 print:px-2 print:py-2">
                              <EntityLink
                                type="projeto"
                                id={item.projetoId}
                                className="font-semibold text-text-primary outline-none transition hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 print:text-slate-950"
                              >
                                {item.numeroProjeto}
                              </EntityLink>
                            </td>
                            <td className="px-5 py-4 print:px-2 print:py-2">
                              <EntityLink
                                type="of"
                                id={item.ofId}
                                className="font-semibold text-text-primary outline-none transition hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 print:text-slate-950"
                              >
                                {item.numeroOf}
                              </EntityLink>
                            </td>
                            <td className="px-5 py-4 print:px-2 print:py-2">
                              <span className="font-semibold text-text-primary print:text-slate-950">
                                {item.codigoOperacional ?? item.opId}
                              </span>
                              {item.descricaoOperacao ? (
                                <span className="mt-1 block text-xs text-text-disabled print:text-[10px] print:text-slate-600">
                                  {item.descricaoOperacao}
                                </span>
                              ) : null}
                            </td>
                            <td className="px-5 py-4 text-text-primary print:px-2 print:py-2 print:text-slate-800">
                              {item.natureza}
                            </td>
                            <td className="px-5 py-4 tabular-nums text-text-primary print:px-2 print:py-2 print:text-slate-800">
                              {item.horasPadrao.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                            </td>
                            <td className="px-5 py-4 print:hidden">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusCalculoStyles[item.statusCalculoMotor].className}`}
                              >
                                {statusCalculoStyles[item.statusCalculoMotor].label}
                              </span>
                            </td>
                            <td className="px-5 py-4 tabular-nums text-text-secondary print:hidden">
                              {item.ordemApresentacao}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-5 py-8 text-center text-sm text-text-secondary print:py-6">
                        A programação vigente não possui nenhuma operação com alocação produtiva.
                      </td>
                    </tr>
                  )
                ) : null}
              </tbody>
            </table>
          </div>

          {estado.tipo === "ok" && estado.programacao.operacoesSemAlocacao.length > 0 ? (
            <div className="border-t border-border-subtle px-5 py-4 print:border-slate-300 print:bg-white">
              <h3 className="text-sm font-semibold text-text-primary print:text-slate-950">
                Operações bloqueadas - sem alocação produtiva (
                {estado.programacao.operacoesSemAlocacao.length})
              </h3>
              <p className="mt-1 text-xs text-text-secondary print:text-slate-700">
                Não aparecem em nenhum recurso/dia porque o Motor não conseguiu alocar nenhuma capacidade a
                elas - preservadas aqui, nunca omitidas.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {estado.programacao.operacoesSemAlocacao.map((op) => (
                  <li
                    key={op.opId}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-surface-elevated px-3 py-2 text-xs print:border-slate-300 print:bg-white"
                  >
                    <EntityLink type="of" id={op.ofId} className="font-semibold text-text-primary print:text-slate-950">
                      {op.numeroOf}
                    </EntityLink>
                    <EntityLink type="projeto" id={op.projetoId} className="text-text-secondary print:text-slate-700">
                      {op.numeroProjeto}
                    </EntityLink>
                    <span className="font-semibold text-text-primary print:text-slate-950">{op.codigoOperacional ?? op.opId}</span>
                    {op.descricaoOperacao ? (
                      <span className="text-text-secondary print:text-slate-700">{op.descricaoOperacao}</span>
                    ) : null}
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 font-semibold ring-1 print:rounded-none print:bg-transparent print:px-0 print:py-0 print:text-slate-950 print:ring-0 ${statusCalculoStyles[op.statusCalculoMotor].className}`}
                    >
                      {statusCalculoStyles[op.statusCalculoMotor].label}
                    </span>
                    <span className="text-text-disabled print:text-slate-700">
                      Déficit residual: {op.deficitResidualHorasPadrao.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}h
                    </span>
                    <span className="text-text-disabled print:text-slate-700">Prioridade: {op.prioridadeUsada}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {estado.tipo === "ok" ? (
            <div className="border-t border-border-subtle px-5 py-3 print:hidden">
              <p className="text-xs text-text-disabled">
                Programação vigente nº {estado.programacao.versaoSequencial} ({estado.programacao.programacaoId}).
                &quot;Status do cálculo&quot; e &quot;Ordem (apresentação)&quot; são colunas técnicas, só na
                tela - a ordem é uma ordenação estável de leitura (prioridade do PCP, depois um desempate
                técnico), não é a sequência horária oficial dentro do dia, que o sistema ainda não registra.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
