// DEC-007 §6.2/Fase 8b (redesenho: página compacta) - card
// presentational, reaproveitado tanto para o cenário-base quanto para o
// cenário ajustado. Linguagem comercial neutra (pedido explícito do
// usuário): nenhum badge "viável"/"inviável" - só os fatos. Quando
// resultadosSaoDiagnostico=true, o término calculado nunca é
// apresentado como entrega confirmada.
//
// Redesenho: só os 5 indicadores principais (início/término/diferença/
// dias ganhos/custo adicional) ficam sempre visíveis - o resto
// (detalhamento de custo por alternativa, horas por natureza,
// diagnósticos, data solicitada/prazo interno de referência) fica atrás
// de "Ver detalhes" (estado local, sem rede) para a página não alongar.
"use client";

import { useState } from "react";
import { Card } from "@/modules/shared/ui/Card";
import type { ResumoCenarioParaExibicao } from "@/modules/simulacao-comercial/lib/cenarios/prepararResumoCenarioParaExibicao";
import { calcularNovoValorOrcamento } from "@/modules/projetos/lib/calcularResumoOrcamento";
import type { NomesDiagnostico } from "@/modules/simulacao-comercial/lib/cenarios/carregarNomesDiagnostico";

export interface ResumoCenarioCardProps {
  titulo: string;
  resumo: ResumoCenarioParaExibicao;
  /** Mostra dias ganhos/custoPorDiaAntecipado - só faz sentido no cenário AJUSTADO, nunca no cenário-base (que é sempre comparado contra si mesmo). */
  mostrarComparacaoComBase?: boolean;
  /**
   * "Valor atual do orçamento" - mesma fonte/fórmula da tela de
   * Orçamento (buscarDadosOrcamento + calcularValorComercialProjeto,
   * compartilhados, nunca uma estimativa paralela). `null` quando o
   * orçamento do projeto ainda não pôde ser resolvido - neste caso os
   * campos de orçamento ficam ocultos, nunca um valor inventado.
   * No cenário AJUSTADO (mostrarComparacaoComBase=true), o card soma o
   * custo adicional EFETIVAMENTE UTILIZADO (resumo.custoAdicionalTotal -
   * nunca o potencial máximo) para mostrar "Novo valor do orçamento".
   */
  valorOrcamentoAtual?: number | null;
  /**
   * Nomes (recurso/operação) para "Diagnóstico técnico das operações" -
   * só exibição, carregados em lote pelo componente pai
   * (carregarNomesDiagnostico). IDs sem entrada no mapa (consulta ainda
   * carregando, ou falhou) caem no fallback: mostram o ID cru, nunca
   * escondem a linha do diagnóstico.
   */
  nomesDiagnostico?: NomesDiagnostico;
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDias(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return "0 dias";
  const abs = Math.abs(dias);
  return dias > 0 ? `${abs} dia${abs === 1 ? "" : "s"} depois` : `${abs} dia${abs === 1 ? "" : "s"} antes`;
}

function formatarDiasGanhos(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return "0 dias";
  return dias > 0 ? `${dias} dia${dias === 1 ? "" : "s"} mais cedo` : `${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"} mais tarde`;
}

function formatarHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

export function ResumoCenarioCard({
  titulo,
  resumo,
  mostrarComparacaoComBase,
  valorOrcamentoAtual,
  nomesDiagnostico,
}: ResumoCenarioCardProps) {
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false);

  function nomeRecurso(id: string): string {
    return nomesDiagnostico?.recursos[id] ?? id;
  }

  function nomeOperacao(id: string): string {
    return nomesDiagnostico?.operacoes[id] ?? id;
  }

  function formatarListaRecursos(ids: readonly string[], vazio: string): string {
    return ids.length > 0 ? ids.map(nomeRecurso).join(", ") : vazio;
  }

  const temHorasDetalhadas =
    resumo.horasHoraExtra > 0 || resumo.horasSabado > 0 || resumo.horasDomingo > 0 || resumo.horasFeriado > 0;

  const valorOrcamentoExibido =
    valorOrcamentoAtual !== null && valorOrcamentoAtual !== undefined
      ? mostrarComparacaoComBase
        ? calcularNovoValorOrcamento(valorOrcamentoAtual, resumo.custoAdicionalTotal)
        : valorOrcamentoAtual
      : null;

  return (
    <Card title={titulo}>
      <div className="flex flex-col gap-4">
        {resumo.resultadosSaoDiagnostico ? (
          <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-[12.5px] text-text-primary">
            Estimativa não conclusiva com os dados atuais - a entrega calculada abaixo é a melhor tentativa
            encontrada, não uma programação concluída.
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Início calculado</dt>
            <dd className="text-text-primary">{formatarDataBr(resumo.inicioCalculado)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Entrega calculada</dt>
            <dd className="text-text-primary">{formatarDataBr(resumo.terminoCalculado)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Diferença vs. data solicitada</dt>
            <dd className="text-text-primary">{formatarDias(resumo.diferencaDiasCivisVsSolicitado)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Dias ganhos vs. cenário atual</dt>
            <dd className="text-text-primary">{mostrarComparacaoComBase ? formatarDiasGanhos(resumo.diasGanhosVsBase) : "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[11.5px] font-semibold text-text-secondary">Custo adicional das alternativas</dt>
            <dd className="text-text-primary">{formatarMoeda(resumo.custoAdicionalTotal)}</dd>
          </div>
          {valorOrcamentoExibido !== null ? (
            <div className="col-span-2">
              <dt className="text-[11.5px] font-semibold text-text-secondary">
                {mostrarComparacaoComBase ? "Novo valor do orçamento" : "Valor atual do orçamento"}
              </dt>
              <dd className="text-text-primary">{formatarMoeda(valorOrcamentoExibido)}</dd>
            </div>
          ) : null}
        </dl>

        {mostrarComparacaoComBase && resumo.custoAdicionalTotal > 0 && (resumo.diasGanhosVsBase === null || resumo.diasGanhosVsBase <= 0) ? (
          <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-[12.5px] text-text-primary">
            Esta capacidade adicional teve custo, mas não reduziu o prazo em relação ao cenário atual.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => setMostrarDetalhes((v) => !v)}
          className="self-start text-[12.5px] font-semibold text-action-primary hover:underline"
        >
          {mostrarDetalhes ? "Ocultar detalhes" : "Ver detalhes"}
        </button>

        {mostrarDetalhes ? (
          <div className="flex flex-col gap-4 border-t border-border-subtle pt-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13.5px]">
              <div>
                <dt className="text-[11.5px] font-semibold text-text-secondary">Data solicitada pelo cliente</dt>
                <dd className="text-text-primary">{formatarDataBr(resumo.dataSolicitadaCliente)}</dd>
              </div>
              <div>
                <dt className="text-[11.5px] font-semibold text-text-secondary">Prazo interno</dt>
                <dd className="text-text-primary">{formatarDataBr(resumo.prazoInterno)}</dd>
              </div>
              {resumo.custoPorAlternativa.antecipacaoMaterial > 0 ? (
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Custo de antecipação de materiais</dt>
                  <dd className="text-text-primary">{formatarMoeda(resumo.custoPorAlternativa.antecipacaoMaterial)}</dd>
                </div>
              ) : null}
              {resumo.custoPorAlternativa.horaExtra > 0 ? (
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">
                    Custo de horas extras/fins de semana/feriados
                  </dt>
                  <dd className="text-text-primary">{formatarMoeda(resumo.custoPorAlternativa.horaExtra)}</dd>
                </div>
              ) : null}
              {resumo.custoPorAlternativa.recursoTemporario > 0 ? (
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Custo de recurso temporário</dt>
                  <dd className="text-text-primary">{formatarMoeda(resumo.custoPorAlternativa.recursoTemporario)}</dd>
                </div>
              ) : null}
              {mostrarComparacaoComBase && resumo.custoPorDiaAntecipado !== null ? (
                <div>
                  <dt className="text-[11.5px] font-semibold text-text-secondary">Custo por dia antecipado</dt>
                  <dd className="text-text-primary">{formatarMoeda(resumo.custoPorDiaAntecipado)}</dd>
                </div>
              ) : null}
            </dl>

            {temHorasDetalhadas ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11.5px] font-semibold text-text-secondary">Horas adicionais utilizadas (realizadas)</p>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-text-primary">
                  {resumo.horasHoraExtra > 0 ? <li>Hora extra: {formatarHoras(resumo.horasHoraExtra)}</li> : null}
                  {resumo.horasSabado > 0 ? <li>Sábado: {formatarHoras(resumo.horasSabado)}</li> : null}
                  {resumo.horasDomingo > 0 ? <li>Domingo: {formatarHoras(resumo.horasDomingo)}</li> : null}
                  {resumo.horasFeriado > 0 ? <li>Feriado: {formatarHoras(resumo.horasFeriado)}</li> : null}
                  {resumo.horasRecursoTemporario > 0 ? <li>Recurso temporário: {formatarHoras(resumo.horasRecursoTemporario)}</li> : null}
                </ul>
              </div>
            ) : null}

            {resumo.diagnosticos.length > 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-[11.5px] font-semibold text-text-secondary">Diagnóstico técnico das operações</p>
                <ul className="flex flex-col gap-3 text-[12.5px] text-text-primary">
                  {resumo.diagnosticos.map((diagnostico) => {
                    const temAtraso = diagnostico.diasAtrasoVsPrazoInterno !== null && diagnostico.diasAtrasoVsPrazoInterno > 0;
                    const temDeficit = diagnostico.deficitResidualHorasPadrao !== null && diagnostico.deficitResidualHorasPadrao > 0;

                    return (
                      <li
                        key={`${diagnostico.chave.bomOperacaoId}-${diagnostico.chave.projetoItemId}`}
                        className="flex flex-col gap-1 rounded-md border border-border-subtle px-3 py-2"
                      >
                        <p className="font-semibold">{nomeOperacao(diagnostico.chave.bomOperacaoId)}</p>

                        {diagnostico.status === "sem_candidato" ? (
                          <p>Nenhum recurso disponível para esta operação.</p>
                        ) : (
                          <>
                            <p>Recursos considerados: {formatarListaRecursos(diagnostico.recursosConsiderados, "Nenhum recurso considerado")}</p>
                            <p>Recursos efetivamente usados: {formatarListaRecursos(diagnostico.recursosUsados, "Nenhum recurso utilizado")}</p>

                            {temDeficit ? <p>Horas que faltam: {diagnostico.deficitResidualHorasPadrao!.toFixed(1)}h-padrão</p> : null}

                            <p>
                              Período calculado: {formatarDataBr(diagnostico.inicioReal)} a {formatarDataBr(diagnostico.terminoReal)}
                            </p>

                            {temDeficit ? (
                              <p>
                                Último dia com capacidade utilizada:{" "}
                                {diagnostico.ultimoDiaComCapacidadeUtilizada ? formatarDataBr(diagnostico.ultimoDiaComCapacidadeUtilizada) : "nenhuma capacidade utilizada ainda"}
                              </p>
                            ) : null}

                            {temAtraso ? (
                              <div className="mt-1 rounded-md border border-status-warning-border bg-status-warning-bg px-2 py-1.5">
                                {diagnostico.ehOcorrenciaFinal ? (
                                  <p>
                                    A operação final terminou após o prazo. O atraso pode ter sido acumulado nas operações
                                    anteriores.
                                  </p>
                                ) : null}
                                <p>Término calculado: {formatarDataBr(diagnostico.terminoReal)}</p>
                                <p>Prazo interno: {formatarDataBr(resumo.prazoInterno)}</p>
                                <p>Dias de atraso: {diagnostico.diasAtrasoVsPrazoInterno}</p>
                              </div>
                            ) : null}

                            {diagnostico.cadeiaObservada ? (
                              <div className="mt-1 flex flex-col gap-2 border-t border-border-subtle pt-2">
                                <p className="font-semibold">Cadeia precedente observada</p>
                                <ol className="flex flex-col gap-2">
                                  {diagnostico.cadeiaObservada.passos.map((passo, indice) => (
                                    <li key={indice} className="flex flex-col gap-0.5">
                                      {passo.tipo === "indisponivel" ? (
                                        <p className="text-status-warning-text">Cadeia incompleta: {passo.motivo}</p>
                                      ) : passo.tipo === "empate" ? (
                                        <div>
                                          <p>Existem caminhos paralelos empatados (mesmo término real) - a cadeia não continua atrás deste ponto:</p>
                                          <ul className="ml-3 list-disc">
                                            {passo.operacoesEmpatadas.map((op) => (
                                              <li key={`${op.chave.bomOperacaoId}-${op.chave.projetoItemId}`}>
                                                {nomeOperacao(op.chave.bomOperacaoId)} · {formatarListaRecursos(op.recursosUsados, "Nenhum recurso utilizado")} ·{" "}
                                                {formatarDataBr(op.inicioReal)} a {formatarDataBr(op.terminoReal)}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : (
                                        <>
                                          <p>
                                            {nomeOperacao(passo.operacao.chave.bomOperacaoId)} ·{" "}
                                            {formatarListaRecursos(passo.operacao.recursosUsados, "Nenhum recurso utilizado")} ·{" "}
                                            {formatarDataBr(passo.operacao.inicioReal)} a {formatarDataBr(passo.operacao.terminoReal)}
                                          </p>
                                          {passo.tipo === "elo" && passo.gapNaoAtribuivel === false ? <p>Precede a próxima operação.</p> : null}
                                          {passo.tipo === "elo" && passo.gapNaoAtribuivel === true ? (
                                            <p>
                                              A operação começou depois da liberação pela cadeia; o motivo específico não pode ser
                                              determinado por estes dados.
                                            </p>
                                          ) : null}
                                        </>
                                      )}
                                    </li>
                                  ))}
                                </ol>
                                <p className="text-[11px] text-text-secondary">
                                  Esta cadeia mostra a sequência observada; não identifica sozinha onde aplicar horas extras.
                                </p>
                              </div>
                            ) : null}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
