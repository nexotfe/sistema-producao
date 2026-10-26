"use client";

export const maxDuration = 300;

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ModuleBackButton } from "@/modules/shared/navigation/ModuleBackButton";
import { EntityLink } from "@/modules/shared/navigation/EntityLink";
import { Button } from "@/modules/shared/ui/Button";
import { consultarFilaPrioridadesPcpAction } from "@/modules/pcp/actions/consultarFilaPrioridadesPcpAction";
import { moverPrioridadeProjetoPcpAction } from "@/modules/pcp/actions/moverPrioridadeProjetoPcpAction";
import type { ItemFilaPrioridadesPcp } from "@/modules/pcp/lib/buscarFilaPrioridadesPcp";
import type {
  ResultadoMoverPrioridadePcp,
  ResultadoRecalculoConsultivoPosMovimento,
} from "@/modules/pcp/actions/orquestrarMovimentoPrioridadePcp";

const currentUser = "Flavio Evangelista";

type EstadoCarregamento =
  | { tipo: "carregando" }
  | { tipo: "nao_autenticado" }
  | { tipo: "nao_autorizado" }
  | { tipo: "falha_tecnica"; mensagem: string }
  | { tipo: "ok"; fila: readonly ItemFilaPrioridadesPcp[] };

type EstadoMovimento =
  | { tipo: "ocioso" }
  | { tipo: "movendo"; projetoId: string }
  | { tipo: "resultado"; projetoId: string; resultado: ResultadoMoverPrioridadePcp };

function dataIsoComOffset(offsetDias: number): string {
  const data = new Date();
  data.setDate(data.getDate() + offsetDias);
  return data.toISOString().slice(0, 10);
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Calcula os vizinhos (anterior/seguinte) necessários para mover um
 * projeto da sua posição sequencial atual para `posicaoDestino` (1-based,
 * só apresentação) - nunca inventa identificadores, só reorganiza a
 * MESMA fila já carregada. `null` quando o destino é igual à posição
 * atual (nada a fazer) ou a fila tem 0/1 projeto (nenhum vizinho
 * possível) - nunca contorna a exigência de reordenar_fila_pcp de pelo
 * menos 1 vizinho chamando o servidor sem necessidade real.
 */
export function calcularVizinhosParaMovimento(
  fila: readonly ItemFilaPrioridadesPcp[],
  projetoId: string,
  posicaoDestino: number,
): { vizinhoAnteriorProjetoId: string | null; vizinhoSeguinteProjetoId: string | null } | null {
  if (fila.length <= 1) return null;

  const posicaoAtual = fila.find((item) => item.projetoId === projetoId)?.posicaoSequencial;
  if (posicaoAtual === undefined) return null;

  const destinoClamped = Math.max(1, Math.min(posicaoDestino, fila.length));
  if (destinoClamped === posicaoAtual) return null;

  const semProjeto = fila.filter((item) => item.projetoId !== projetoId);
  const indiceDestino = destinoClamped - 1;

  const vizinhoAnterior = indiceDestino > 0 ? semProjeto[indiceDestino - 1] : null;
  const vizinhoSeguinte = indiceDestino < semProjeto.length ? semProjeto[indiceDestino] : null;

  return {
    vizinhoAnteriorProjetoId: vizinhoAnterior?.projetoId ?? null,
    vizinhoSeguinteProjetoId: vizinhoSeguinte?.projetoId ?? null,
  };
}

const MENSAGENS_FALHA_RECALCULO: Record<string, string> = {
  sem_margem_segura_para_executar: "não havia tempo restante seguro para rodar o Motor depois da movimentação - a prioridade e a justificativa já foram registradas normalmente.",
  versao_capacidade_indisponivel: "não foi possível confirmar a versão atual de capacidade.",
  capacidade_mudou_durante_calculo: "a capacidade mudou durante o cálculo - resultado descartado, tente novamente.",
  interrompido_por_limite_de_tempo: "o cálculo foi interrompido por exceder o tempo limite - a prioridade e a justificativa já foram registradas normalmente.",
  falha_na_worker: "falha na execução do Motor - a prioridade e a justificativa já foram registradas normalmente.",
  falha_interna: "falha interna ao calcular - tente novamente.",
  falha_inesperada: "o passo de recálculo não terminou normalmente - a prioridade e a justificativa já foram registradas normalmente, sem relação com esta falha.",
};

/**
 * Etapa 2O.8B-I6-C: `recalculo` já é o resultado REAL do Motor rodando
 * numa Worker supervisionada (nunca mais simulado) - "Motor concluiu o
 * cálculo" (ok:true) é uma afirmação sobre o cálculo consultivo, nunca
 * sobre a programação oficial ter sido aprovada ou persistida.
 */
function ResumoRecalculo({ recalculo }: { recalculo: ResultadoRecalculoConsultivoPosMovimento }) {
  if (!recalculo.ok) {
    const detalhe = "detalhe" in recalculo ? recalculo.detalhe : undefined;
    return (
      <p className="text-sm text-status-warning-text">
        Recálculo não concluído: {MENSAGENS_FALHA_RECALCULO[recalculo.motivo] ?? recalculo.motivo}
        {detalhe ? ` (${detalhe})` : ""}
      </p>
    );
  }

  const programadas = recalculo.operacoes.filter((o) => o.status === "concluida").length;
  const comDeficit = recalculo.operacoes.filter((o) => o.status === "bloqueada_por_deficit").length;
  const bloqueadasPorPredecessora = recalculo.operacoes.filter((o) => o.status === "bloqueada_por_predecessora").length;
  const excluidas = recalculo.excluidas.length;

  if (recalculo.operacoes.length === 0 && excluidas === 0) {
    return <p className="text-sm text-text-secondary">Recálculo concluído: nenhuma operação programável encontrada para esta empresa no período informado.</p>;
  }

  return (
    <p className="text-sm text-text-secondary">
      Recálculo concluído (versão de capacidade {recalculo.versaoCapacidadeUtilizada}):{" "}
      <strong className="text-text-primary">{programadas}</strong> operação(ões) programada(s),{" "}
      <strong className="text-text-primary">{comDeficit}</strong> com déficit de capacidade,{" "}
      <strong className="text-text-primary">{bloqueadasPorPredecessora}</strong> bloqueada(s) por predecessora
      {excluidas > 0 ? (
        <>
          {" "}e <strong className="text-text-primary">{excluidas}</strong> excluída(s) por dados insuficientes
        </>
      ) : null}
      . Resultado consultivo - identificação individual de OPs não está disponível neste resumo; consulte a Programação
      Diária para o detalhamento por recurso e data.
    </p>
  );
}

export default function PrioridadesPcpPage() {
  const [estado, setEstado] = useState<EstadoCarregamento>({ tipo: "carregando" });
  const [busca, setBusca] = useState("");
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [movimento, setMovimento] = useState<EstadoMovimento>({ tipo: "ocioso" });
  const [destinoPorProjeto, setDestinoPorProjeto] = useState<Record<string, string>>({});
  const [dataInicial, setDataInicial] = useState(() => dataIsoComOffset(0));
  const [dataFinal, setDataFinal] = useState(() => dataIsoComOffset(6));
  const [motivo, setMotivo] = useState("");

  // Sequenciador de pedidos - garante que uma resposta de movimentação
  // atrasada (fora de ordem) nunca sobrescreva o resultado de um pedido
  // mais recente já concluído.
  const ultimoPedidoRef = useRef(0);

  const carregarFila = useCallback(async () => {
    let resultado: Awaited<ReturnType<typeof consultarFilaPrioridadesPcpAction>>;
    try {
      resultado = await consultarFilaPrioridadesPcpAction();
    } catch (erro) {
      setEstado({
        tipo: "falha_tecnica",
        mensagem: erro instanceof Error ? erro.message : "Falha desconhecida ao consultar a fila de prioridades.",
      });
      return;
    }

    if (!resultado.ok) {
      setEstado({ tipo: resultado.motivo === "nao_autenticado" ? "nao_autenticado" : "nao_autorizado" });
      return;
    }

    setEstado({ tipo: "ok", fila: resultado.fila });
  }, []);

  useEffect(() => {
    carregarFila();
  }, [carregarFila]);

  async function moverProjeto(projetoId: string, posicaoDestino: number) {
    if (estado.tipo !== "ok" || somenteLeitura) return;
    if (movimento.tipo === "movendo") return; // nunca duas movimentações simultâneas.

    const vizinhos = calcularVizinhosParaMovimento(estado.fila, projetoId, posicaoDestino);
    if (!vizinhos) return; // sem mudança real, ou impossível (fila com 0/1 projeto) - nunca chama o servidor.

    if (!motivo.trim()) {
      // Validação local, NUNCA chama o servidor sem justificativa - a
      // fila real não muda (nenhuma requisição foi feita), consistente
      // com "conservar a prioridade anterior" mesmo neste caso.
      setMovimento({
        tipo: "resultado",
        projetoId,
        resultado: { ok: false, motivo: "payload_invalido", detalhe: "Informe o motivo da movimentação antes de confirmar." },
      });
      return;
    }

    const meuPedido = ++ultimoPedidoRef.current;
    setMovimento({ tipo: "movendo", projetoId });

    let resultado: ResultadoMoverPrioridadePcp;
    try {
      resultado = await moverPrioridadeProjetoPcpAction({
        projetoId,
        vizinhoAnteriorProjetoId: vizinhos.vizinhoAnteriorProjetoId,
        vizinhoSeguinteProjetoId: vizinhos.vizinhoSeguinteProjetoId,
        motivo,
        dataInicial,
        dataFinal,
      });
    } catch (erro) {
      if (ultimoPedidoRef.current !== meuPedido) return; // resposta obsoleta - descartada.
      setMovimento({
        tipo: "resultado",
        projetoId,
        resultado: {
          ok: false,
          motivo: "falha_reordenacao",
          detalhe: erro instanceof Error ? erro.message : "Falha desconhecida ao mover prioridade.",
        },
      });
      await carregarFila();
      return;
    }

    if (ultimoPedidoRef.current !== meuPedido) return; // outra movimentação mais recente já respondeu - descarta esta.

    if (!resultado.ok && resultado.motivo === "nao_autorizado") {
      setSomenteLeitura(true);
    }

    setMovimento({ tipo: "resultado", projetoId, resultado });
    // Nunca reordena a fila localmente - sempre busca de novo a ordem
    // real, sucesso ou falha, para nunca mostrar um resultado antigo
    // como se fosse o mais atual (mudança própria ou de outro usuário).
    await carregarFila();
  }

  const filaVisivel =
    estado.tipo === "ok"
      ? estado.fila.filter((item) => {
          const termo = busca.trim().toLowerCase();
          if (!termo) return true;
          return (
            item.numeroProjeto.toLowerCase().includes(termo) ||
            item.nomeProjeto.toLowerCase().includes(termo) ||
            (item.nomeCliente ?? "").toLowerCase().includes(termo)
          );
        })
      : [];

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <ModuleBackButton label="PCP" />
            <p className="text-sm font-semibold">{currentUser}</p>
          </div>

          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-disabled">PCP</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">Prioridades do PCP</h1>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(220px,320px)_auto] sm:items-center">
              <label htmlFor="busca-prioridades" className="sr-only">
                Buscar projeto
              </label>
              <input
                id="busca-prioridades"
                type="search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar projeto, descrição ou cliente"
                className="h-11 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition placeholder:text-text-disabled focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface-elevated px-4 text-sm font-semibold text-text-primary transition hover:bg-border-subtle"
              >
                Início
              </Link>
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
              className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-xs font-semibold text-text-primary transition hover:bg-border-subtle"
            >
              Programação diária
            </Link>
            <Link
              href="/pcp/prioridades"
              className="rounded-md bg-action-primary-hover px-3 py-2 text-xs font-semibold text-action-primary-text"
            >
              Prioridades
            </Link>
          </nav>
        </header>

        <section className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-semibold text-text-primary">Fila de prioridades dos projetos</h2>
            <p className="mt-2 text-sm text-text-secondary">
              Prioridade 1 é o projeto que merece maior atenção da fábrica inteira - PCP, Compras, Almoxarifado,
              Engenharia, Programação CNC, Produção e serviços terceirizados consultam esta mesma ordem. Mover um
              projeto aqui aciona automaticamente um recálculo consultivo - a programação oficial só muda por um
              procedimento separado e autorizado.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
              <div>
                <label htmlFor="data-inicial" className="mb-1 block text-xs font-semibold text-text-secondary">
                  Período avaliado pelo recálculo - início
                </label>
                <input
                  id="data-inicial"
                  type="date"
                  value={dataInicial}
                  onChange={(event) => setDataInicial(event.target.value)}
                  className="h-10 rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div>
                <label htmlFor="data-final" className="mb-1 block text-xs font-semibold text-text-secondary">
                  fim
                </label>
                <input
                  id="data-final"
                  type="date"
                  value={dataFinal}
                  onChange={(event) => setDataFinal(event.target.value)}
                  className="h-10 rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div>
                <label htmlFor="motivo-movimentacao" className="mb-1 block text-xs font-semibold text-text-secondary">
                  Justificativa da movimentação (obrigatória antes de mover qualquer projeto)
                </label>
                <input
                  id="motivo-movimentacao"
                  type="text"
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder="Ex.: antecipação solicitada pela diretoria"
                  className="h-10 w-full rounded-md border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            {somenteLeitura ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Você tem permissão apenas para visualizar as prioridades - os controles de movimentação foram
                desativados nesta sessão.
              </p>
            ) : null}

            {estado.tipo === "nao_autenticado" ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Sessão não autenticada - faça login novamente para ver as prioridades.
              </p>
            ) : null}
            {estado.tipo === "nao_autorizado" ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Você não tem a permissão pcp.visualizar_programacao necessária para ver esta tela.
              </p>
            ) : null}
            {estado.tipo === "falha_tecnica" ? (
              <p className="mt-3 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                Falha técnica ao consultar as prioridades: {estado.mensagem}
              </p>
            ) : null}

            {movimento.tipo === "resultado" ? (
              <div className="mt-3 rounded-md border border-border-subtle bg-border-subtle px-3 py-3">
                {movimento.resultado.ok ? (
                  <>
                    <p className="text-sm font-semibold text-status-success-text">
                      Prioridade atualizada (nova posição interna: {movimento.resultado.posicaoNova}).
                    </p>
                    {!movimento.resultado.liberacaoReserva.liberada ? (
                      <p className="mt-1 text-sm text-status-warning-text">
                        A alteração de prioridade foi registrada normalmente, mas a execução do recálculo ficou com
                        situação não confirmada ({movimento.resultado.liberacaoReserva.detalhe}). Novas movimentações
                        desta empresa ficam bloqueadas até a recuperação segura da reserva.
                      </p>
                    ) : null}
                    <div className="mt-1">
                      <ResumoRecalculo recalculo={movimento.resultado.recalculo} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-status-warning-text">
                    {movimento.resultado.motivo === "reserva_ocupada"
                      ? movimento.resultado.detalhe.situacao === "recuperacao_pendente"
                        ? "Não foi possível mover: o recálculo anterior desta empresa ficou com situação não confirmada e aguarda recuperação segura antes de uma nova tentativa."
                        : `Não foi possível mover agora: ${movimento.resultado.detalhe.responsavelAtualNome} está com uma movimentação/recálculo em andamento nesta empresa. Tente novamente em alguns instantes.`
                      : movimento.resultado.motivo === "falha_ao_iniciar_reserva"
                        ? `Não foi possível iniciar a movimentação: ${movimento.resultado.detalhe}`
                        : movimento.resultado.motivo === "falha_reordenacao"
                          ? `Não foi possível alterar a prioridade: ${movimento.resultado.detalhe}`
                          : movimento.resultado.motivo === "payload_invalido"
                            ? `Movimentação inválida: ${movimento.resultado.detalhe}`
                            : movimento.resultado.motivo === "nao_autorizado"
                              ? "Você não tem permissão para alterar prioridades."
                              : movimento.resultado.motivo === "nao_autenticado"
                                ? "Sessão não autenticada."
                                : "Não foi possível concluir a movimentação."}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border-subtle bg-border-subtle text-xs font-semibold uppercase tracking-[0.16em] text-text-disabled">
                <tr>
                  <th className="px-5 py-3">Prioridade</th>
                  <th className="px-5 py-3">Projeto</th>
                  <th className="px-5 py-3">Descrição</th>
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Data objetivo</th>
                  <th className="px-5 py-3">Movimentação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {estado.tipo === "carregando" ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-text-secondary">
                      Carregando prioridades...
                    </td>
                  </tr>
                ) : estado.tipo === "ok" && estado.fila.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-text-secondary">
                      Nenhum projeto na fila de prioridades desta empresa ainda.
                    </td>
                  </tr>
                ) : estado.tipo === "ok" && filaVisivel.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-text-secondary">
                      Nenhum projeto encontrado para &quot;{busca}&quot;.
                    </td>
                  </tr>
                ) : estado.tipo === "ok" ? (
                  filaVisivel.map((item) => {
                    const estaMovendoEsteProjeto = movimento.tipo === "movendo" && movimento.projetoId === item.projetoId;
                    const algumMovimentoEmAndamento = movimento.tipo === "movendo";
                    const controlesDesabilitados = somenteLeitura || algumMovimentoEmAndamento || estado.fila.length <= 1;

                    return (
                      <tr key={item.projetoId} className="transition hover:bg-border-subtle">
                        <td className="px-5 py-4">
                          <span className="inline-flex h-7 w-10 items-center justify-center rounded-md border border-border-subtle bg-border-subtle text-xs font-semibold tabular-nums text-text-primary">
                            {item.posicaoSequencial}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <EntityLink
                            type="projeto"
                            id={item.projetoId}
                            className="font-semibold text-text-primary outline-none transition hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                          >
                            {item.numeroProjeto}
                          </EntityLink>
                        </td>
                        <td className="px-5 py-4 text-text-primary">{item.nomeProjeto}</td>
                        <td className="px-5 py-4 text-text-primary">{item.nomeCliente ?? "—"}</td>
                        <td className="px-5 py-4 tabular-nums text-text-primary">{formatarDataBr(item.dataObjetivo)}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="secondary"
                              size="icon"
                              disabled={controlesDesabilitados || item.posicaoSequencial === 1}
                              onClick={() => moverProjeto(item.projetoId, item.posicaoSequencial - 1)}
                              aria-label={`Subir prioridade do projeto ${item.numeroProjeto}`}
                              title="Subir uma posição"
                            >
                              ▲
                            </Button>
                            <Button
                              variant="secondary"
                              size="icon"
                              disabled={controlesDesabilitados || item.posicaoSequencial === estado.fila.length}
                              onClick={() => moverProjeto(item.projetoId, item.posicaoSequencial + 1)}
                              aria-label={`Descer prioridade do projeto ${item.numeroProjeto}`}
                              title="Descer uma posição"
                            >
                              ▼
                            </Button>
                            <label className="sr-only" htmlFor={`mover-para-${item.projetoId}`}>
                              Mover projeto {item.numeroProjeto} para a posição
                            </label>
                            <input
                              id={`mover-para-${item.projetoId}`}
                              type="number"
                              min={1}
                              max={estado.fila.length}
                              value={destinoPorProjeto[item.projetoId] ?? String(item.posicaoSequencial)}
                              disabled={controlesDesabilitados}
                              onChange={(event) =>
                                setDestinoPorProjeto((atual) => ({ ...atual, [item.projetoId]: event.target.value }))
                              }
                              className="h-9 w-16 rounded-md border border-border bg-surface-elevated px-2 text-sm tabular-nums text-text-primary outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                            />
                            <Button
                              variant="secondary"
                              disabled={controlesDesabilitados}
                              onClick={() => {
                                const destino = Number(destinoPorProjeto[item.projetoId] ?? item.posicaoSequencial);
                                if (!Number.isFinite(destino)) return;
                                moverProjeto(item.projetoId, destino);
                              }}
                            >
                              {estaMovendoEsteProjeto ? "Movendo..." : "Mover"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
