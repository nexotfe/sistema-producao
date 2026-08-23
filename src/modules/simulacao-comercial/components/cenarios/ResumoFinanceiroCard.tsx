// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial + resumo
// financeiro) - substitui o placeholder desabilitado "Resumo financeiro"
// (CartaoConfiguracao). Valores vêm EXCLUSIVAMENTE da Previsão comercial
// por capacidade (saidaAtual/saidaAjustada, avaliarPrevisaoComercialFlexivel)
// - nunca do motor técnico antigo (resumoBase/resumoAjustado, removidos
// desta tela). Impostos/margem/carga tributária NUNCA são calculados
// aqui - só a soma (custo técnico atual + custo adicional do cenário);
// a Proposta aplica a fórmula existente (calcularResumoOrcamento) uma
// única vez sobre o valor-base resultante.
//
// "Aprovar cenário" aprova sempre o que está EM VIGOR na tela (ajustado
// se calculado, senão o atual - mesma convenção já usada nos cartões de
// custo) - nunca um seletor adicional (decisão confirmada com o
// usuário). A Server Action (aprovarCenarioComercialAction) recalcula
// tudo no servidor antes de gravar; esta tela só monta o payload com as
// decisões configuradas e o que está sendo exibido, para comparação.
"use client";

import { useState } from "react";
import { Card } from "@/modules/shared/ui/Card";
import { Badge } from "@/modules/shared/ui/Badge";
import { Button } from "@/modules/shared/ui/Button";
import { Modal } from "@/modules/shared/ui/Modal";
import { supabase } from "@/lib/supabaseClient";
import { aprovarCenarioComercialAction } from "@/modules/simulacao-comercial/actions/aprovarCenarioComercialAction";
import { buscarCenarioAprovadoPorChaveIdempotencia } from "@/modules/simulacao-comercial/lib/cenarios/buscarCenarioAprovadoPorChaveIdempotencia";
import type { CenarioAjustadoPrevisao } from "@/modules/simulacao-comercial/hooks/usePrevisaoComercialCapacidade";
import type { SaidaPrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/montarPrevisaoComercialProjeto";
import type { CenarioComercialAprovadoResumo } from "@/modules/projetos/lib/buscarCenarioComercialAprovado";
import { calcularNovoValorOrcamento } from "@/modules/projetos/lib/calcularResumoOrcamento";

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDiferenca(diferencaEmDias: number | null): string {
  if (diferencaEmDias === null) return "—";
  if (diferencaEmDias === 0) return "Na data solicitada";
  if (diferencaEmDias > 0) return `${diferencaEmDias} dia(s) depois da data solicitada`;
  return `${Math.abs(diferencaEmDias)} dia(s) antes da data solicitada`;
}

export interface PremissasComerciaisAtuais {
  readonly dataNecessidade: string;
  readonly margemSegurancaDias: number;
  readonly dataPrevistaAprovacaoPedido: string;
}

export interface ResumoFinanceiroCardProps {
  readonly projetoId: string;
  /** Custo técnico atual (soma dos itens, sem margem/imposto) - null enquanto ainda carregando/não resolvível. */
  readonly custoTecnicoAtual: number | null;
  /** Só informativo (valorComercial atual, já com margem/imposto) - nunca usado na soma. */
  readonly valorComercialAtualReferencia: number | null;
  readonly premissas: PremissasComerciaisAtuais;
  readonly saidaAtual: SaidaPrevisaoComercial | null;
  /** null = nenhuma alternativa (hora extra/recurso temporário/material) configurada ainda. */
  readonly saidaAjustada: SaidaPrevisaoComercial | null;
  /** Mesmas decisões já usadas por usePrevisaoComercialCapacidade - reaproveitadas aqui, nunca re-derivadas. */
  readonly cenarioAjustado: CenarioAjustadoPrevisao | null;
  /** Cenário já vigente para este projeto, se houver - exige motivo de substituição na confirmação. */
  readonly cenarioJaAprovado: CenarioComercialAprovadoResumo | null;
  readonly onCenarioAprovado: () => void;
}

export function ResumoFinanceiroCard({
  projetoId,
  custoTecnicoAtual,
  valorComercialAtualReferencia,
  premissas,
  saidaAtual,
  saidaAjustada,
  cenarioAjustado,
  cenarioJaAprovado,
  onCenarioAprovado,
}: ResumoFinanceiroCardProps) {
  const [modalAberto, setModalAberto] = useState(false);
  const [motivoSubstituicao, setMotivoSubstituicao] = useState("");
  const [aprovando, setAprovando] = useState(false);
  const [erroAprovacao, setErroAprovacao] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  // Migração 20260822195805 (idempotência - correção do usuário após o
  // achado de travamento em "Aprovando..."): gerada quando o modal ABRE
  // (abrirConfirmacao), reaproveitada em toda nova tentativa da MESMA
  // confirmação - nunca regenerada a cada clique. Só uma chave nova se
  // o usuário fechar e reabrir o modal (uma decisão nova de aprovar).
  const [chaveIdempotencia, setChaveIdempotencia] = useState("");

  const saidaEfetiva = saidaAjustada ?? saidaAtual;
  const tipoCenarioEfetivo: "atual" | "ajustado" = saidaAjustada ? "ajustado" : "atual";
  const calculavel = custoTecnicoAtual !== null && saidaEfetiva !== null && saidaEfetiva.status === "calculado";

  const custoNegociacaoMaterial = saidaEfetiva?.custoAdicional?.negociacaoMaterial ?? 0;
  const custoHoraAdicional = saidaEfetiva?.custoAdicional?.horaAdicional ?? 0;
  const custoRecursoTemporario = saidaEfetiva?.custoAdicional?.recursoTemporario ?? 0;
  const custoTerceirizacao = 0; // Motor novo ainda não cobre terceirização (necessidadeCapacidadeFlexivel.ts) - sempre 0 nesta fase.
  const custoAdicionalTotal = saidaEfetiva?.custoAdicional?.total ?? custoNegociacaoMaterial + custoHoraAdicional + custoRecursoTemporario;
  const novoValorBase = custoTecnicoAtual !== null ? calcularNovoValorOrcamento(custoTecnicoAtual, custoAdicionalTotal) : null;

  function abrirConfirmacao() {
    setErroAprovacao(null);
    setSucesso(null);
    setMotivoSubstituicao("");
    setChaveIdempotencia(crypto.randomUUID());
    setModalAberto(true);
  }

  /**
   * Depois de uma falha AMBÍGUA da RPC (a chamada de rede em si falhou,
   * nunca houve resposta limpa - motivo="gravacao_incerta"), consulta se
   * a aprovação já foi gravada com a MESMA chave antes de decidir
   * qualquer coisa. Achou = trata como sucesso (a escrita aconteceu, só
   * a resposta se perdeu). Não achou = nada foi gravado, libera nova
   * tentativa com a MESMA chave (a RPC é idempotente - mesmo que a
   * primeira tentativa ainda esteja em voo em algum lugar e complete
   * depois, ela nunca duplica: devolve o cenário já existente).
   */
  async function verificarEDecidirAposGravacaoIncerta() {
    const encontrado = await buscarCenarioAprovadoPorChaveIdempotencia(supabase, projetoId, chaveIdempotencia);

    if (encontrado) {
      setModalAberto(false);
      setSucesso("Cenário comercial aprovado com sucesso.");
      onCenarioAprovado();
      return;
    }

    setErroAprovacao(
      "A conexão caiu antes de confirmar a gravação. Verificamos e nada foi registrado - pode tentar novamente com segurança.",
    );
  }

  async function confirmarAprovacao() {
    if (!calculavel || custoTecnicoAtual === null || !saidaEfetiva) return;

    if (cenarioJaAprovado && motivoSubstituicao.trim() === "") {
      setErroAprovacao("Informe o motivo da substituição - já existe um cenário aprovado vigente para este projeto.");
      return;
    }

    setAprovando(true);
    setErroAprovacao(null);

    try {
      const resultado = await aprovarCenarioComercialAction({
        projetoId,
        tipoCenario: tipoCenarioEfetivo,
        dataNecessidade: premissas.dataNecessidade,
        margemSegurancaDias: premissas.margemSegurancaDias,
        dataPrevistaAprovacaoPedido: premissas.dataPrevistaAprovacaoPedido,
        capacidadeExtraAutorizada: tipoCenarioEfetivo === "ajustado" ? (cenarioAjustado?.capacidadeExtraAutorizada ?? []) : [],
        temporariosPorPrioridade: tipoCenarioEfetivo === "ajustado" ? (cenarioAjustado?.temporariosPorPrioridade ?? []) : [],
        disponibilidadeMaterialNegociada: tipoCenarioEfetivo === "ajustado" ? (cenarioAjustado?.disponibilidadeMaterialNegociada ?? null) : null,
        contratacoes: tipoCenarioEfetivo === "ajustado" ? (cenarioAjustado?.contratacoes ?? []) : [],
        contratacaoNegociacaoMaterial: tipoCenarioEfetivo === "ajustado" ? (cenarioAjustado?.contratacaoNegociacaoMaterial ?? null) : null,
        statusExibido: saidaEfetiva.status,
        primeiraEntregaPossivelExibida: saidaEfetiva.primeiraEntregaPossivel,
        diferencaEmDiasExibida: saidaEfetiva.diferencaEmDias,
        custoAdicionalExibido: saidaEfetiva.custoAdicional,
        custoTecnicoAtualExibido: custoTecnicoAtual,
        valorComercialAtualReferenciaExibido: valorComercialAtualReferencia,
        motivoSubstituicao: cenarioJaAprovado ? motivoSubstituicao.trim() : null,
        chaveIdempotencia,
      });

      if (!resultado.ok) {
        // gravacao_incerta nunca aparece aqui como "erro comum" - exige
        // a verificação acima antes de qualquer mensagem para o usuário.
        if (resultado.motivo === "gravacao_incerta") {
          await verificarEDecidirAposGravacaoIncerta();
          return;
        }

        // tempo_esgotado/falha_etapa: tela INTERNA (orçamentista/admin,
        // nunca vista pelo cliente) - mostrar a etapa identifica onde
        // parar para investigar, sem expor a mensagem técnica bruta
        // (essa continua só no console.error do servidor). Achado real:
        // "Nada foi gravado" é sempre verdade aqui - ambas as etapas
        // rastreadas só existem ANTES da chamada a persistir.
        if (resultado.motivo === "tempo_esgotado") {
          setErroAprovacao(
            `Tempo esgotado na etapa "${resultado.etapa}". Nada foi gravado - corrija a etapa antes de tentar novamente.`,
          );
          return;
        }
        if (resultado.motivo === "falha_etapa") {
          setErroAprovacao(
            `Falha na etapa "${resultado.etapa}" (${resultado.duracaoMs}ms). Nada foi gravado - veja o log do servidor para o detalhe técnico antes de tentar novamente.`,
          );
          return;
        }

        const mensagens: Record<string, string> = {
          nao_autenticado: "Sessão expirada - faça login novamente antes de aprovar.",
          nao_autorizado: "Você não tem permissão de administrador para aprovar um cenário comercial.",
          sem_janela_produtiva: "Não foi possível recalcular a janela produtiva no servidor - revise as premissas comerciais.",
          divergente: "Os dados mudaram desde o último cálculo - recalcule o cenário antes de aprovar.",
          sem_prazo_calculavel: "Não foi possível determinar um prazo dentro do horizonte avaliado - revise as alternativas.",
          sem_orcamento_resolvivel: "Não foi possível resolver o orçamento atual do projeto - revise os itens do orçamento.",
          erro: "mensagem" in resultado ? resultado.mensagem : "Não foi possível concluir a aprovação.",
        };
        setErroAprovacao(mensagens[resultado.motivo] ?? "Não foi possível concluir a aprovação.");
        return;
      }

      setModalAberto(false);
      setSucesso("Cenário comercial aprovado com sucesso.");
      onCenarioAprovado();
    } catch {
      // A PRÓPRIA chamada à Server Action lançou (ex.: falha de
      // transporte invocando o endpoint) - tão ambíguo quanto
      // gravacao_incerta (não sabemos se o servidor chegou a gravar),
      // mesma verificação antes de decidir.
      await verificarEDecidirAposGravacaoIncerta();
    } finally {
      // SEMPRE roda - mesmo se aprovarCenarioComercialAction ou a
      // verificação pós-gravação-incerta lançarem algo inesperado. É a
      // correção direta do achado real (travamento em "Aprovando...":
      // antes, um erro não tratado no meio do fluxo deixava o botão
      // preso para sempre, sem nenhuma forma de tentar de novo).
      setAprovando(false);
    }
  }

  return (
    <Card title="Resumo financeiro">
      <div className="flex flex-col gap-3">
        {/*
          CORREÇÃO (DEC-007 §6.2/Fase 8b, achada em teste visual real -
          projeto 260011): este cartão mostra só a SIMULAÇÃO em edição
          (saidaAtual/saidaAjustada, previsão comercial nova) - nunca
          mais um banner com valores de cenarioJaAprovado aqui, para
          nunca risco de rotular um número da simulação como "aprovado".
          O cenário vigente congelado tem cartão PRÓPRIO
          (CenarioAprovadoVigenteCard, sempre visível, independente de
          recalcular) - separação estrutural pedida pelo usuário. Rótulo
          "ainda não aprovada" explícito abaixo para nunca confundir com
          o cartão vigente.
        */}
        {calculavel ? (
          <Badge variant="warning" className="self-start">
            Simulação — ainda não aprovada
          </Badge>
        ) : null}

        {!calculavel ? (
          <p className="text-[13px] text-text-secondary">Calcule o cenário atual (e, se quiser, o ajustado) para ver o resumo financeiro.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Valor atual do orçamento</dt>
              <dd className="text-text-primary">{formatarMoeda(custoTecnicoAtual)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Negociação de material</dt>
              <dd className="text-text-primary">{formatarMoeda(custoNegociacaoMaterial)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Horas adicionais efetivamente utilizadas</dt>
              <dd className="text-text-primary">{formatarMoeda(custoHoraAdicional)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Recursos temporários</dt>
              <dd className="text-text-primary">{formatarMoeda(custoRecursoTemporario)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Terceirização</dt>
              <dd className="text-text-primary">{formatarMoeda(custoTerceirizacao)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Total dos custos adicionais</dt>
              <dd className="text-text-primary">{formatarMoeda(custoAdicionalTotal)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11.5px] font-semibold text-text-secondary">Novo valor-base do orçamento (ainda sem impostos)</dt>
              <dd className="text-text-primary">{novoValorBase !== null ? formatarMoeda(novoValorBase) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Data solicitada pelo cliente</dt>
              <dd className="text-text-primary">{formatarDataBr(saidaEfetiva?.dataSolicitadaCliente ?? null)}</dd>
            </div>
            <div>
              <dt className="text-[11.5px] font-semibold text-text-secondary">Prazo proposto pelo cenário</dt>
              <dd className="text-text-primary">{formatarDataBr(saidaEfetiva?.primeiraEntregaPossivel ?? null)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11.5px] font-semibold text-text-secondary">Diferença entre o prazo proposto e a data solicitada</dt>
              <dd className="text-text-primary">{formatarDiferenca(saidaEfetiva?.diferencaEmDias ?? null)}</dd>
            </div>
          </dl>
        )}

        {sucesso ? <p className="text-[12.5px] text-status-success-text">{sucesso}</p> : null}

        <div>
          <Button onClick={abrirConfirmacao} disabled={!calculavel}>
            Aprovar cenário
          </Button>
        </div>
      </div>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title="Aprovar cenário comercial" size="lg">
        <div className="flex flex-col gap-4">
          <p className="text-[13.5px] text-text-primary">
            {tipoCenarioEfetivo === "ajustado"
              ? `Você está aprovando o cenário ajustado, com prazo proposto em ${formatarDataBr(saidaEfetiva?.primeiraEntregaPossivel ?? null)} e custo adicional de ${formatarMoeda(custoAdicionalTotal)}.`
              : `Você está aprovando o cenário atual, sem custo adicional, com prazo proposto em ${formatarDataBr(saidaEfetiva?.primeiraEntregaPossivel ?? null)}.`}
          </p>
          <p className="text-[13px] text-text-secondary">Novo valor-base do orçamento: {novoValorBase !== null ? formatarMoeda(novoValorBase) : "—"}.</p>
          <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-[12.5px] text-text-primary">
            Impostos e margem serão calculados posteriormente, na Proposta. Esta aprovação não cria Ordem de Fabricação nem programação de PCP.
          </p>

          {cenarioJaAprovado ? (
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="motivo-substituicao-cenario" className="text-[12.5px] font-semibold text-text-primary">
                Motivo da substituição (obrigatório)
              </label>
              <textarea
                id="motivo-substituicao-cenario"
                value={motivoSubstituicao}
                onChange={(e) => setMotivoSubstituicao(e.target.value)}
                rows={3}
                className="w-full rounded-[10px] border border-border bg-surface-elevated px-[13px] py-2 text-[13.5px] text-text-primary outline-none transition placeholder:text-text-disabled focus-visible:border-action-primary focus-visible:ring-[3px] focus-visible:ring-focus-ring"
                placeholder="Ex.: cliente renegociou o prazo e autorizou hora adicional."
              />
            </div>
          ) : null}

          {erroAprovacao ? <p className="text-[12.5px] text-status-danger-text">{erroAprovacao}</p> : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalAberto(false)} disabled={aprovando}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarAprovacao}
              disabled={aprovando || (cenarioJaAprovado !== null && motivoSubstituicao.trim() === "")}
            >
              {aprovando ? "Aprovando..." : "Confirmar aprovação"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
