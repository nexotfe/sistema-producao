// DEC-007 §6.2/Fase 8b (redesenho: página compacta + janelas amplas) -
// container da tela de Cenários. Funciona ANTES de qualquer aprovação
// (correção de fluxo pedida pelo usuário durante o desenho original):
// recebe suas próprias premissas comerciais e calcula a janela produtiva
// com a MESMA `prepararJanelaComercial`/`calcularJanelaComercialParaExibicao`
// já usada pela tela de Simulação - nunca uma segunda fórmula. Uma
// simulação já aprovada (`simulacoes_comerciais.vigente=true`), se
// existir, só pré-preenche os campos como referência - nunca é
// pré-requisito.
//
// CORREÇÃO (DEC-007 §6.2/Fase 8b, aprovação do cenário comercial -
// achada em teste visual real, projeto 260011): calcular um cenário
// nunca persiste nada por si só, mas "Aprovar cenário" (dentro do
// Resumo financeiro) grava de verdade, via RPC própria
// (aprovar_cenario_comercial) - a tela deixou de afirmar "nada é salvo
// ou aprovado" de forma incondicional.
//
// Redesenho (não aprovado antes: formulário "uma linha por
// recurso/data" não escalava): premissas viram um cartão-resumo +
// modal; comparação mostra só os indicadores principais (detalhes
// recolhíveis); configurações detalhadas (Capacidade e recursos,
// Materiais) abrem em janelas amplas. Terceirização/Resumo financeiro
// ficam como cartões placeholder nesta rodada (pedido explícito).
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  calcularJanelaComercialParaExibicao,
  mensagemErroJanelaComercial,
} from "@/modules/simulacao-comercial/lib/calcularJanelaComercialParaExibicao";
import { prepararJanelaComercial, type ResultadoJanelaComercial } from "@/modules/simulacao-comercial/lib/prepararJanelaComercial";
import { carregarBaseCenarios, type BaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";
import { executarCarregamentoComTimeout } from "@/modules/simulacao-comercial/lib/executarCarregamentoComTimeout";
import type { DecisoesCenario } from "@/modules/simulacao-comercial/lib/cenarios/avaliarCenario";
import { usePrevisaoComercialCapacidade } from "@/modules/simulacao-comercial/hooks/usePrevisaoComercialCapacidade";
import { PremissasJanelaComercialForm } from "@/modules/simulacao-comercial/components/PremissasJanelaComercialForm";
import { buscarDadosOrcamento } from "@/modules/projetos/lib/buscarDadosOrcamento";
import type { ProjectType } from "@/modules/projetos/types";
import { calcularValorComercialProjeto } from "@/modules/projetos/lib/calcularResumoOrcamento";
import { buscarCenarioComercialAprovado, type CenarioComercialAprovadoResumo } from "@/modules/projetos/lib/buscarCenarioComercialAprovado";
import { Modal } from "@/modules/shared/ui/Modal";
import { Button } from "@/modules/shared/ui/Button";
import { CartaoConfiguracao } from "./CartaoConfiguracao";
import { MateriaisConfiguracaoCard } from "./MateriaisConfiguracaoCard";
import { CapacidadeRecursosConfiguracaoCard } from "./CapacidadeRecursosConfiguracaoCard";
import { PrevisaoComercialCapacidadeCard } from "./PrevisaoComercialCapacidadeCard";
import { ResumoFinanceiroCard } from "./ResumoFinanceiroCard";
import { CenarioAprovadoVigenteCard } from "./CenarioAprovadoVigenteCard";

async function buscarEmpresaId(): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return null;
  }

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("empresa_id")
    .eq("id", userData.user.id)
    .single();

  return usuario?.empresa_id ?? null;
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export interface GeradorComparadorCenariosProps {
  projetoId: string;
}

export function GeradorComparadorCenarios({ projetoId }: GeradorComparadorCenariosProps) {
  const [dataNecessidade, setDataNecessidade] = useState("");
  const [margemSegurancaDiasTexto, setMargemSegurancaDiasTexto] = useState("0");
  const [dataPrevistaAprovacaoPedido, setDataPrevistaAprovacaoPedido] = useState("");
  const [modalPremissasAberto, setModalPremissasAberto] = useState(false);

  const [janelaComercial, setJanelaComercial] = useState<ResultadoJanelaComercial | null>(null);
  const [calculandoJanela, setCalculandoJanela] = useState(false);
  const [erroJanela, setErroJanela] = useState<string | null>(null);

  // Estado bruto só é escrito de dentro do efeito assíncrono que
  // carrega a base (nunca sincronamente no corpo do efeito -
  // react-hooks/set-state-in-effect); `base` (derivada abaixo) é quem
  // realmente reflete "há uma base válida para esta janela AGORA" -
  // evita um setState síncrono só para invalidar quando a janela deixa
  // de ser válida.
  //
  // CORREÇÃO (travamento real, achado em teste visual - orçamento
  // 260007): a mesma derivação precisa valer para carregandoBase/
  // erroBase, não só para base - ver comentário equivalente e mais
  // detalhado em usePrevisaoComercialCapacidade.ts (mesmo bug, mesmo
  // fix, motor novo). Sem isto, "Calcular cenário atual" podia ficar
  // desabilitado para sempre depois de uma sequência de edições de
  // premissa que fizesse a janela oscilar válida/inválida enquanto
  // carregarBaseCenarios ainda estava em voo.
  const [baseCarregada, setBaseCarregada] = useState<BaseCenarios | null>(null);
  const [carregandoBaseBruto, setCarregandoBase] = useState(false);
  const [erroBaseBruto, setErroBase] = useState<string | null>(null);
  const base = janelaComercial?.valida ? baseCarregada : null;
  const carregandoBase = janelaComercial?.valida ? carregandoBaseBruto : false;
  const erroBase = janelaComercial?.valida ? erroBaseBruto : null;
  // "Tentar novamente" (proteção de UX, orçamento 260007) - mesma
  // convenção de recarregaResumoFinanceiro, mais abaixo: incrementar
  // este contador força o efeito de carregarBaseCenarios a rodar de
  // novo, sem duplicar a lógica de carregamento em si.
  const [tentativaBase, setTentativaBase] = useState(0);
  function handleTentarNovamenteBase() {
    setTentativaBase((v) => v + 1);
  }

  // DEC-007 §6.2/Fase 8b (aprovação do cenário comercial + resumo
  // financeiro) - "valor atual do orçamento" (custo técnico, sem margem/
  // imposto) e o cenário já aprovado vigente (se houver), independentes
  // da janela comercial - carregados por projetoId, com uma "geração"
  // própria (recarregaResumoFinanceiro) para o card poder pedir uma
  // recarga explícita logo após aprovar um cenário novo, sem depender de
  // nenhum outro estado desta tela.
  const [custoTecnicoAtualOrcamento, setCustoTecnicoAtualOrcamento] = useState<number | null>(null);
  const [valorComercialAtualReferencia, setValorComercialAtualReferencia] = useState<number | null>(null);
  // CORREÇÃO (projeto de Industrialização, orçamento 260007, DEC-007):
  // tipoProjeto vem do MESMO buscarDadosOrcamento já chamado abaixo -
  // antes era descartado; passa a decidir a disponibilidade de material
  // (ver dataDisponibilidadeMaterialResolvida, mais abaixo). null =
  // ainda não carregado - naturezaIndustrializacao fica false nesse
  // meio-tempo (nunca assume industrialização por omissão).
  const [tipoProjeto, setTipoProjeto] = useState<ProjectType | null>(null);
  const naturezaIndustrializacao = tipoProjeto === "industrializacao";
  // CORREÇÃO (achada em teste visual real, projeto 260011): tri-estado -
  // `undefined` = ainda carregando (nunca mostrar "Nenhum cenário
  // aprovado" nesse meio-tempo, CenarioAprovadoVigenteCard trata os 3
  // estados). `null` = carregado, confirmado que não há vigente.
  const [cenarioJaAprovado, setCenarioJaAprovado] = useState<CenarioComercialAprovadoResumo | null | undefined>(undefined);
  const [recarregaResumoFinanceiro, setRecarregaResumoFinanceiro] = useState(0);

  // Dois painéis independentes (antecipação de materiais + capacidade e
  // recursos), cada um guardando a `base` junto da decisão para poder
  // descartar o ajuste quando a base mudar (premissas comerciais
  // editadas) SEM precisar de um setState síncrono dentro do efeito que
  // recarrega a base (react-hooks/set-state-in-effect) - "stale" é
  // derivado durante o render por identidade de referência. As duas
  // decisões alimentam separadamente `cenarioAjustadoPrevisao` (motor
  // novo, logo abaixo), sem que um painel sobrescreva o estado do outro.
  const [ajustadoAntecipacao, setAjustadoAntecipacao] = useState<{ base: BaseCenarios; decisoes: DecisoesCenario } | null>(
    null,
  );
  const decisoesAntecipacao =
    ajustadoAntecipacao && ajustadoAntecipacao.base === base ? ajustadoAntecipacao.decisoes : null;
  const [calculandoAntecipacao, setCalculandoAntecipacao] = useState(false);

  const [ajustadoCapacidadeExtra, setAjustadoCapacidadeExtra] = useState<{
    base: BaseCenarios;
    decisoes: DecisoesCenario;
  } | null>(null);
  const decisoesCapacidadeExtra =
    ajustadoCapacidadeExtra && ajustadoCapacidadeExtra.base === base ? ajustadoCapacidadeExtra.decisoes : null;
  const [calculandoCapacidadeExtra, setCalculandoCapacidadeExtra] = useState(false);

  // Disponibilidade de material - original (motor antigo,
  // base.restricaoMaterialPorChave) e negociada (decisoesAntecipacao,
  // se configurada). Movido para cá (antes vivia mais abaixo, perto de
  // handleCalcularCenarioBase) porque agora alimenta TAMBÉM a previsão
  // comercial nova (cenarioAjustadoPrevisao, logo abaixo) e a janela do
  // modal de capacidade (CapacidadeRecursosConfiguracaoCard, no JSX) -
  // nenhuma fórmula nova, mesmas 2 expressões de antes.
  const disponibilidadeOriginalMaterial = base ? (Object.values(base.restricaoMaterialPorChave)[0] ?? null) : null;
  const dataNegociadaMaterial = decisoesAntecipacao?.antecipacoesMaterial[0]?.dataDisponibilidadeAntecipada ?? null;

  // Previsão comercial por capacidade (DEC-007, motor novo) - MESMAS
  // decisões já configuradas acima (decisoesCapacidadeExtra para hora
  // extra/recurso temporário, decisoesAntecipacao para material),
  // reaproveitadas tal como estão: os dois motores (antigo avaliarCenario
  // e novo avaliarPrevisaoComercialFlexivel) aceitam os mesmos tipos
  // (CapacidadeExtraDia/DecisaoRecursoTemporario/Contratacao) - nenhum
  // controle de UI novo precisa existir só para isto. null enquanto
  // NENHUMA das duas alternativas tiver sido calculada ainda (nunca um
  // cenário ajustado "vazio" fingido).
  //
  // CORREÇÃO (DEC-007, achada em teste visual real - projeto 260011):
  // antes, só decisoesCapacidadeExtra gatilhava um cenário ajustado -
  // negociar material sozinho (sem nenhuma hora extra) nunca alimentava
  // a previsão nova. `contratacoes` aqui é a MESMA lista de
  // decisoesCapacidadeExtra.contratacoes (DecisoesCenario.contratacoes é
  // única, cobre hora extra E recurso temporário juntos - ver
  // montarPrevisaoComercialProjeto.ts, que categoriza o custo por
  // contratacaoId, nunca pela lista de origem).
  const cenarioAjustadoPrevisao = useMemo(() => {
    if (!decisoesCapacidadeExtra && !decisoesAntecipacao) return null;
    return {
      capacidadeExtraAutorizada: decisoesCapacidadeExtra?.capacidadeExtra ?? [],
      temporariosPorPrioridade: decisoesCapacidadeExtra?.recursosTemporarios ?? [],
      disponibilidadeMaterialNegociada: dataNegociadaMaterial,
      contratacoes: decisoesCapacidadeExtra?.contratacoes ?? [],
      contratacaoNegociacaoMaterial: decisoesAntecipacao?.contratacoes[0] ?? null,
    };
  }, [decisoesCapacidadeExtra, decisoesAntecipacao, dataNegociadaMaterial]);

  // CORREÇÃO (projeto de Industrialização, orçamento 260007, DEC-007):
  // disponibilidade ORIGINAL de material - já resolvida corretamente por
  // natureza dentro de prepararJanelaComercial (modoDisponibilidadeMaterial,
  // ver o efeito que popula janelaComercial, mais abaixo) - não precisa
  // mais de um branch aqui; janelaComercial.dataDisponibilidadeProducao
  // já É a Data Prevista de Aprovação do Pedido para Industrialização,
  // sem os deslocamentos genéricos de +9+1 dias. Único ponto de leitura,
  // alimenta os dois motores (carregarBaseCenarios abaixo e
  // usePrevisaoComercialCapacidade) e a exibição em MateriaisConfiguracaoCard
  // (via disponibilidadeOriginalMaterial, que lê de volta base.restricaoMaterialPorChave).
  const dataDisponibilidadeMaterialResolvida = janelaComercial?.valida ? janelaComercial.dataDisponibilidadeProducao : "";

  const previsaoComercial = usePrevisaoComercialCapacidade({
    projetoId,
    janelaComercial,
    dataSolicitadaCliente: dataNecessidade,
    janelaInicioGrade: dataPrevistaAprovacaoPedido,
    disponibilidadeMaterialOrcamentoNovo: dataDisponibilidadeMaterialResolvida,
    cenarioAjustado: cenarioAjustadoPrevisao,
  });

  const margemSegurancaDias = Number(margemSegurancaDiasTexto.replace(",", "."));
  const margemSegurancaValida = Number.isInteger(margemSegurancaDias) && margemSegurancaDias >= 0;

  // O cenário-base só aparece depois de um clique explícito em
  // "Calcular cenário atual" - guarda QUAIS premissas foram
  // confirmadas; se o usuário editar qualquer uma depois, a comparação
  // por igualdade abaixo já volta a false sozinha, sem precisar de
  // nenhum setState adicional.
  const [premissasConfirmadas, setPremissasConfirmadas] = useState<{
    dataNecessidade: string;
    margemSegurancaDias: number;
    dataPrevistaAprovacaoPedido: string;
  } | null>(null);
  const cenarioBaseConfirmado =
    premissasConfirmadas !== null &&
    premissasConfirmadas.dataNecessidade === dataNecessidade &&
    premissasConfirmadas.margemSegurancaDias === margemSegurancaDias &&
    premissasConfirmadas.dataPrevistaAprovacaoPedido === dataPrevistaAprovacaoPedido;

  // Pré-preenchimento por conveniência (nunca bloqueio): Data de
  // Necessidade vem de projetos.data_objetivo; margem/data prevista de
  // aprovação vêm da simulação vigente, se existir - editáveis depois,
  // a tela nunca exige que uma simulação aprovada exista.
  useEffect(() => {
    let cancelado = false;

    async function carregarPreenchimentoInicial() {
      const { data: projeto } = await supabase
        .from("projetos")
        .select("data_objetivo")
        .eq("id", projetoId)
        .maybeSingle();

      if (!cancelado && projeto?.data_objetivo) {
        setDataNecessidade(projeto.data_objetivo);
      }

      const { data: vigente } = await supabase
        .from("simulacoes_comerciais")
        .select("margem_seguranca_dias,data_prevista_aprovacao_pedido")
        .eq("projeto_id", projetoId)
        .eq("vigente", true)
        .maybeSingle();

      if (!cancelado && vigente) {
        setMargemSegurancaDiasTexto(String(vigente.margem_seguranca_dias));
        if (vigente.data_prevista_aprovacao_pedido) {
          setDataPrevistaAprovacaoPedido(vigente.data_prevista_aprovacao_pedido);
        }
      }
    }

    carregarPreenchimentoInicial();

    return () => {
      cancelado = true;
    };
  }, [projetoId]);

  // Mesma camada de preparação comercial da tela de Simulação - reusada
  // sem alteração (nunca uma segunda fórmula de janela produtiva).
  useEffect(() => {
    let cancelado = false;

    calcularJanelaComercialParaExibicao(
      { dataNecessidade, margemSegurancaDiasProdutivos: margemSegurancaDias, dataPrevistaAprovacaoPedido },
      margemSegurancaValida,
      {
        buscarEmpresaId,
        prepararJanela: (empresaId, premissas) =>
          prepararJanelaComercial(supabase, empresaId, premissas, naturezaIndustrializacao ? "industrializacao" : "padrao"),
      },
      {
        setErro: setErroJanela,
        setJanela: setJanelaComercial,
        setCalculando: setCalculandoJanela,
        foiCancelado: () => cancelado,
      },
    );

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataNecessidade, margemSegurancaDias, dataPrevistaAprovacaoPedido, naturezaIndustrializacao]);

  // "Base congelada uma vez" por janela válida - carregada de novo só
  // se a disponibilidade de material (que vira o piso da base) mudar,
  // nunca a cada cenário avaliado sobre ela.
  //
  // Proteção de UX (travamento real, achado em teste visual - orçamento
  // 260007): executarCarregamentoComTimeout garante um timeout com erro
  // recuperável (ver seu cabeçalho para o contrato completo) - sem
  // isto, uma consulta que nunca resolvesse deixaria carregandoBase
  // pendurado indefinidamente, mesmo já com a corrida original
  // corrigida (derivação de carregandoBase/erroBase pela validade da
  // janela, acima). `tentativaBase` (mesma convenção de
  // recarregaResumoFinanceiro) é o que "Tentar novamente" incrementa.
  useEffect(() => {
    let cancelado = false;

    if (!janelaComercial?.valida) {
      return;
    }

    async function carregar(): Promise<BaseCenarios> {
      const empresaId = await buscarEmpresaId();
      if (!empresaId) {
        throw new Error("Usuário não autenticado.");
      }
      return carregarBaseCenarios(supabase, empresaId, projetoId, dataDisponibilidadeMaterialResolvida, janelaComercial!.prazoInterno);
    }

    executarCarregamentoComTimeout(carregar, {
      setCarregando: setCarregandoBase,
      setErro: setErroBase,
      setDados: setBaseCarregada,
      foiCancelado: () => cancelado,
    });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId, janelaComercial?.valida, dataDisponibilidadeMaterialResolvida, tentativaBase]);

  // "Valor atual do orçamento" (custo técnico) + cenário comercial já
  // aprovado (se houver) - independentes da janela comercial, só de
  // projetoId. `recarregaResumoFinanceiro` permite ao ResumoFinanceiroCard
  // pedir uma recarga explícita logo após aprovar um cenário novo (para
  // o banner "cenário já aprovado" e o motivo de substituição refletirem
  // a aprovação imediatamente), sem precisar recarregar a base inteira.
  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      setCenarioJaAprovado(undefined);

      const [dadosOrcamento, cenarioAprovado] = await Promise.all([
        buscarDadosOrcamento(supabase, projetoId),
        buscarCenarioComercialAprovado(supabase, projetoId),
      ]);
      if (cancelado) return;

      if (dadosOrcamento) {
        const { custoTotal, valorComercial } = calcularValorComercialProjeto({
          itens: dadosOrcamento.itensCalculados,
          margemLucroPercent: dadosOrcamento.projeto.margemLucroPercent,
          cargaTributariaPercent: dadosOrcamento.projeto.cargaTributariaPercent,
          cargaTributariaSugerida: dadosOrcamento.cargaTributariaSugerida,
          descontoPercentual: dadosOrcamento.projeto.descontoPercentual,
        });
        setCustoTecnicoAtualOrcamento(custoTotal);
        setValorComercialAtualReferencia(valorComercial);
        setTipoProjeto(dadosOrcamento.projeto.tipoProjeto);
      } else {
        setCustoTecnicoAtualOrcamento(null);
        setValorComercialAtualReferencia(null);
        setTipoProjeto(null);
      }

      setCenarioJaAprovado(cenarioAprovado);
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, [projetoId, recarregaResumoFinanceiro]);

  // NOTA (correção DEC-007, achada em teste visual real - projeto
  // 260011): os cartões compactos "Materiais"/"Capacidade e recursos"
  // costumavam ter aqui um 2º recorte isolado (só a alternativa em
  // questão) via avaliarCenario/prepararResumoCenarioParaExibicao (motor
  // antigo), para mostrar "ganho de prazo"/"horas utilizadas"/"custo"
  // PRÓPRIOS daquela alternativa. Isso contradizia a previsão comercial
  // NOVA na mesma tela (ex.: "0h utilizadas" aqui enquanto a previsão
  // cobrava custo real de hora adicional) - removido; os dois cartões
  // agora leem exclusivamente previsaoComercial.saidaAjustada (ver JSX
  // abaixo).
  //
  // CORREÇÃO (pedido explícito do usuário, achado durante a correção do
  // seletor "Recurso" - DEC-007): o bloco "Ver detalhamento técnico
  // experimental do roteiro" (resumoBase/resumoAjustado, motor antigo -
  // avaliarCenario/prepararResumoCenarioParaExibicao) foi REMOVIDO desta
  // tela - ele ainda somava OPs de subconjunto e podia mostrar prazo/custo
  // contraditórios com a previsão comercial nova (única fonte visível de
  // prazo/capacidade utilizada/custo aqui, ver PrevisaoComercialCapacidadeCard
  // abaixo). O motor antigo (avaliarCenario.ts, prepararResumoCenarioParaExibicao.ts,
  // ResumoCenarioCard.tsx e seus testes) continua intacto para auditoria
  // futura - esta tela simplesmente parou de chamá-lo, por não ter mais
  // nenhum outro consumidor aqui.

  function handleCalcularAntecipacao(decisoes: DecisoesCenario) {
    // Defesa em profundidade (projeto de Industrialização, orçamento
    // 260007): o botão "Configurar" de Materiais já fica desabilitado
    // para essa natureza (MateriaisConfiguracaoCard/CartaoConfiguracao),
    // tornando este caminho inalcançável pela UI - guarda aqui mesmo
    // assim, nunca confiando só no botão desabilitado.
    if (!base || naturezaIndustrializacao) return;
    setCalculandoAntecipacao(true);
    setAjustadoAntecipacao({ base, decisoes });
    // Síncrono (useMemo acima) - o "calculando" só existe pra dar
    // feedback visual imediato ao clique, nunca fica pendurado em true.
    setCalculandoAntecipacao(false);
  }

  function handleCalcularCapacidadeExtra(decisoes: DecisoesCenario) {
    if (!base) return;
    setCalculandoCapacidadeExtra(true);
    setAjustadoCapacidadeExtra({ base, decisoes });
    setCalculandoCapacidadeExtra(false);
  }

  function handleCalcularCenarioBase() {
    setPremissasConfirmadas({ dataNecessidade, margemSegurancaDias, dataPrevistaAprovacaoPedido });
    setModalPremissasAberto(false);
  }

  // DEC-007 §6.2/Fase 8b (correção achada em teste visual real, projeto
  // 260011) - depois de uma aprovação bem-sucedida, o badge "Simulação —
  // ainda não aprovada" continuava visível até recarregar a página,
  // descrevendo exatamente o que acabou de ser aprovado. Em vez de um
  // 3º rótulo ("simulação aprovada") que precisaria ficar comparando a
  // simulação em edição contra o cenário vigente a cada keystroke (e
  // dessincronizaria de novo no primeiro ajuste de premissa), a
  // simulação inteira é desmontada: zera as duas alternativas
  // calculadas E despreenche as premissas confirmadas, o que já
  // desmonta todo o bloco (Materiais/Capacidade e recursos/Resumo
  // financeiro) pelo mesmo gate `cenarioBaseConfirmado && base` usado no
  // JSX - cobre tanto aprovar o cenário "atual" quanto o "ajustado" (só
  // zerar as alternativas não seria suficiente para o caso "atual", que
  // não usa nenhuma delas). O cartão vigente (CenarioAprovadoVigenteCard,
  // fora deste gate) permanece sempre visível e é recarregado por
  // recarregaResumoFinanceiro, mostrando o que acabou de ser aprovado.
  function handleCenarioAprovado() {
    setRecarregaResumoFinanceiro((v) => v + 1);
    setAjustadoAntecipacao(null);
    setAjustadoCapacidadeExtra(null);
    setPremissasConfirmadas(null);
  }

  const podeCalcularCenarioBase = Boolean(janelaComercial?.valida) && !calculandoJanela && !carregandoBase;
  const premissasIncompletas = !dataNecessidade || !dataPrevistaAprovacaoPedido || !margemSegurancaValida;

  // CORREÇÃO DE UX (travamento real, orçamento 260007): antes, este
  // status só existia no cartão de fundo "Premissas comerciais" - com a
  // modal "Editar premissas" aberta por cima, o usuário nunca via por
  // que o botão "Calcular cenário atual" estava desabilitado (mensagem
  // escondida atrás da própria modal que ele tinha aberto para agir).
  // Extraído para uma função local (closure sobre o estado do
  // componente, mesmo padrão de handleCalcularCenarioBase etc.) e
  // renderizado nos DOIS lugares - no cartão (resumo quando a modal está
  // fechada) e dentro da modal, ao lado do botão (o usuário nunca
  // precisa fechar a modal para ver o erro ou tentar de novo). Função
  // simples que devolve JSX (nunca `<StatusPremissas />`) - de propósito,
  // para não criar um tipo de componente novo a cada render (o que
  // desmontaria/remontaria o resultado a cada tecla digitada).
  function renderStatusPremissas() {
    if (premissasIncompletas) {
      return <p className="text-[12.5px] text-text-secondary">Preencha as 3 premissas para calcular o cenário atual.</p>;
    }
    if (calculandoJanela) {
      return <p className="text-[12.5px] text-text-secondary">Calculando janela produtiva...</p>;
    }
    if (erroJanela) {
      return <p className="text-[12.5px] text-status-danger-text">{erroJanela}</p>;
    }
    if (janelaComercial && !janelaComercial.valida) {
      return <p className="text-[12.5px] text-status-danger-text">{mensagemErroJanelaComercial(janelaComercial)}</p>;
    }
    if (carregandoBase) {
      return <p className="text-[12.5px] text-text-secondary">Carregando dados do projeto...</p>;
    }
    if (erroBase) {
      return (
        <div className="flex items-center gap-3">
          <p className="text-[12.5px] text-status-danger-text">{erroBase}</p>
          <Button variant="secondary" onClick={handleTentarNovamenteBase}>
            Tentar novamente
          </Button>
        </div>
      );
    }
    if (base && !cenarioBaseConfirmado) {
      return <p className="text-[12.5px] text-text-secondary">Premissas prontas - clique em &quot;Editar premissas&quot; para calcular.</p>;
    }
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[15px] font-semibold text-text-primary">Cenários</h2>
        <p className="mt-1 text-[13.5px] text-text-secondary">
          O sistema calcula o prazo e o custo de cada alternativa. Nada é salvo automaticamente pelo cálculo — só a
          aprovação explícita do cenário (botão &quot;Aprovar cenário&quot;, com confirmação) registra uma decisão
          real, usada depois pelo Orçamento e pela Proposta.
        </p>
      </div>

      <CartaoConfiguracao titulo="Premissas comerciais" onConfigurar={() => setModalPremissasAberto(true)} rotuloBotao="Editar premissas">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Data solicitada</dt>
            <dd className="text-text-primary">{formatarDataBr(dataNecessidade || null)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Aprovação prevista</dt>
            <dd className="text-text-primary">{formatarDataBr(dataPrevistaAprovacaoPedido || null)}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Margem</dt>
            <dd className="text-text-primary">{margemSegurancaValida ? `${margemSegurancaDias} dia(s) produtivo(s)` : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11.5px] font-semibold text-text-secondary">Prazo interno</dt>
            <dd className="text-text-primary">{janelaComercial?.valida ? formatarDataBr(janelaComercial.prazoInterno) : "—"}</dd>
          </div>
        </dl>

        <div className="mt-3">
          {renderStatusPremissas()}
        </div>
      </CartaoConfiguracao>

      {/*
        CORREÇÃO (DEC-007 §6.2/Fase 8b, achada em teste visual real -
        projeto 260011): SEMPRE renderizado, fora do gate
        `cenarioBaseConfirmado && base` abaixo - antes, o único aviso de
        "cenário já aprovado" morava dentro de ResumoFinanceiroCard, que
        só aparece depois de recalcular as premissas, escondendo o
        cenário vigente ao simplesmente reabrir a página. Este cartão só
        lê `cenarioJaAprovado` (banco, congelado) - nunca a simulação em
        edição.
      */}
      <CenarioAprovadoVigenteCard cenarioJaAprovado={cenarioJaAprovado} />

      <Modal open={modalPremissasAberto} onClose={() => setModalPremissasAberto(false)} title="Premissas comerciais" size="lg">
        <div className="flex flex-col gap-4">
          <PremissasJanelaComercialForm
            dataNecessidade={dataNecessidade}
            onDataNecessidadeChange={setDataNecessidade}
            margemSegurancaDiasTexto={margemSegurancaDiasTexto}
            onMargemSegurancaDiasTextoChange={setMargemSegurancaDiasTexto}
            margemSegurancaValida={margemSegurancaValida}
            dataPrevistaAprovacaoPedido={dataPrevistaAprovacaoPedido}
            onDataPrevistaAprovacaoPedidoChange={setDataPrevistaAprovacaoPedido}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleCalcularCenarioBase} disabled={!podeCalcularCenarioBase}>
              {calculandoJanela || carregandoBase ? "Calculando..." : "Calcular cenário atual"}
            </Button>
            {renderStatusPremissas()}
          </div>
        </div>
      </Modal>

      {cenarioBaseConfirmado && base ? (
        <>
          <PrevisaoComercialCapacidadeCard
            saidaAtual={previsaoComercial.saidaAtual}
            saidaAjustada={previsaoComercial.saidaAjustada}
            nomesRecursos={previsaoComercial.nomesRecursos}
            carregando={previsaoComercial.carregandoBase}
            erro={previsaoComercial.erroBase}
            onTentarNovamente={previsaoComercial.tentarNovamenteBase}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <CapacidadeRecursosConfiguracaoCard
              base={base}
              necessidadesOrcamentoNovo={previsaoComercial.base?.necessidadesOrcamentoNovo ?? []}
              empresaId={base.empresaId}
              // CORREÇÃO (achada em teste visual real, projeto 260011):
              // a janela configurável começa na disponibilidade
              // NEGOCIADA quando existe (nunca antes dela - o material
              // ainda não está lá) - antes usava sempre a disponibilidade
              // original, rejeitando regras de hora extra em datas já
              // viáveis depois de negociar antecipação de material.
              janelaInicio={janelaComercial!.valida ? (dataNegociadaMaterial ?? janelaComercial!.dataDisponibilidadeProducao) : ""}
              prazoInterno={janelaComercial!.valida ? janelaComercial!.prazoInterno : ""}
              onCalcular={handleCalcularCapacidadeExtra}
              calculando={calculandoCapacidadeExtra}
              // CORREÇÃO (achada em teste visual real, projeto 260011): vem
              // da previsão comercial NOVA (saidaAjustada), nunca mais do
              // motor antigo isolado (resumoCapacidadeExtra) - as duas
              // fontes podiam contradizer uma a outra na tela (ex.: "0h
              // utilizadas" aqui enquanto a previsão cobrava custo real).
              horasUtilizadas={previsaoComercial.saidaAjustada?.capacidadeUtilizada?.horaAdicionalHoras ?? null}
              custoUtilizado={previsaoComercial.saidaAjustada?.custoAdicional?.horaAdicional ?? null}
              // Correção de transparência (DEC-007 §6.2, achada em teste
              // visual real - projeto 260011): mesma fonte de
              // horasUtilizadas/custoUtilizado acima, só que por recurso
              // em vez de somado - nunca uma segunda leitura.
              detalhamentoPorRecurso={previsaoComercial.saidaAjustada?.detalhamentoPorRecurso ?? []}
              nomesRecursos={previsaoComercial.nomesRecursos}
            />

            <MateriaisConfiguracaoCard
              base={base}
              disponibilidadeOriginal={disponibilidadeOriginalMaterial}
              dataNegociada={dataNegociadaMaterial}
              naturezaIndustrializacao={naturezaIndustrializacao}
              // CORREÇÃO (achada em teste visual real, projeto 260011): vem
              // da previsão comercial NOVA (saidaAjustada), nunca mais do
              // motor antigo isolado (resumoMateriais). Sem "ganho de
              // prazo" isolado - quando material é combinado com hora
              // extra no mesmo cenário ajustado, não existe uma avaliação
              // só do material para atribuir esse número (ver comentário
              // do componente).
              custo={previsaoComercial.saidaAjustada?.custoAdicional?.negociacaoMaterial ?? null}
              onCalcular={handleCalcularAntecipacao}
              calculando={calculandoAntecipacao}
            />

            <CartaoConfiguracao titulo="Terceirização" desabilitado motivoDesabilitado="Ainda não implementado nesta fase.">
              <p>Nenhuma terceirização configurada ainda.</p>
            </CartaoConfiguracao>

            <ResumoFinanceiroCard
              projetoId={projetoId}
              custoTecnicoAtual={custoTecnicoAtualOrcamento}
              valorComercialAtualReferencia={valorComercialAtualReferencia}
              premissas={{ dataNecessidade, margemSegurancaDias, dataPrevistaAprovacaoPedido }}
              saidaAtual={previsaoComercial.saidaAtual}
              saidaAjustada={previsaoComercial.saidaAjustada}
              cenarioAjustado={cenarioAjustadoPrevisao}
              // undefined (ainda carregando) tratado como "sem cenário
              // aprovado" aqui - só afeta a exigência de motivo na
              // aprovação, uma janela breve (1 select indexado).
              cenarioJaAprovado={cenarioJaAprovado ?? null}
              onCenarioAprovado={handleCenarioAprovado}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
