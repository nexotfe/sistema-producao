// DEC-007 §6.2/Fase 8b (redesenho: regras semanais compactas) -
// substitui a planilha diária (não aprovada - complexa demais para
// centenas de OFs) por regras semanais compactas por recurso ("segunda
// a sexta, 2h/dia"). O sistema expande cada regra internamente em
// CapacidadeExtraDia[]/DisponibilidadeDiaRecursoTemporario[] (só na
// fronteira com o motor - expandirRegraSemanal.ts/
// construirDecisoesCapacidadeExtraDeRegras.ts, nenhum motor novo).
// Custo de recurso INTERNO é automático (valor-hora cadastrado ×
// percentual da convenção coletiva vigente na data); recurso
// externo/temporário mantém custeio próprio e manual.
"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Field } from "@/modules/shared/ui/Field";
import { Select } from "@/modules/shared/ui/Select";
import { Button } from "@/modules/shared/ui/Button";
import {
  carregarContextoCalendario,
  resolverDiaProdutivoComContexto,
  type ContextoCalendario,
} from "@/modules/calendario/lib/contextoCalendario";
import { derivarNaturezaDia, type NaturezaDia } from "@/modules/simulacao-comercial/lib/cenarios/derivarNaturezaDia";
import {
  expandirRegraSemanal,
  calcularSemanaFim,
  segundaDaSemana,
  calcularJanelaEfetivaSemana,
  type DiasRegraSemanal,
  type DiaUtilSemana,
} from "@/modules/simulacao-comercial/lib/cenarios/expandirRegraSemanal";
import {
  construirDecisoesCapacidadeExtraDeRegras,
  encontrarDataSemConvencaoAplicavel,
  encontrarRegraConflitante,
  type RegraSemanalCapacidadeExtra,
} from "@/modules/simulacao-comercial/lib/cenarios/construirDecisoesCapacidadeExtraDeRegras";
import { ocorrenciasAplicaveisARecurso } from "@/modules/simulacao-comercial/lib/cenarios/ocorrenciasAplicaveisARecurso";
import { resolverProdutividadeRecurso } from "@/modules/simulacao-comercial/lib/cenarios/resolverProdutividadeRecurso";
import {
  construirDecisoesRecursoTemporario,
  type RecursoTemporarioParaConstruir,
} from "@/modules/simulacao-comercial/lib/cenarios/construirDecisoesRecursoTemporario";
import { combinarDecisoesCenario } from "@/modules/simulacao-comercial/lib/cenarios/combinarDecisoesCenario";
import { calcularCustoContratacoes, type AbrangenciaContratacao } from "@/modules/simulacao-comercial/lib/cenarios/contratacao";
import {
  invalidarConfiguracaoForaDeEscopo,
  recursosCompativeisDeNecessidades,
  recursosOriginaisDeNecessidades,
} from "@/modules/simulacao-comercial/lib/cenarios/derivarRecursosConfiguracaoCapacidade";
import type { BaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";
import type { DecisoesCenario } from "@/modules/simulacao-comercial/lib/cenarios/avaliarCenario";
import type { NecessidadeCapacidadeFlexivel } from "@/modules/simulacao-comercial/lib/cenarios/necessidadeCapacidadeFlexivel";
import type { RecursoTemporarioCenario, TipoRecursoTemporario } from "@/modules/simulacao-comercial/lib/cenarios/recursoTemporario";

export interface SemanaConfiguradaResumo {
  readonly semanaInicio: string;
  readonly semanaFim: string;
  readonly recursoNome: string;
  readonly horasDisponibilizadas: number;
}

export interface ResumoCapacidadeRecursos {
  recursosAjustados: number;
  /** Soma de horas AUTORIZADAS por todas as regras ativas (potencial - nunca confundir com horas realmente usadas pelo cálculo, ver "Ver detalhes" no cartão de comparação). */
  horasAdicionaisDisponibilizadas: number;
  recursosAlternativos: number;
  recursosTemporarios: number;
  /** Custo se TODA hora disponibilizada fosse usada - potencial máximo, nunca o custo real do cenário (esse vem do resultado avaliado, não daqui). */
  custoPotencialMaximo: number;
  /** 1 entrada por regra ativa - cada regra cobre exatamente 1 semana (nunca repete), ver expandirRegraSemanal.ts. */
  semanasConfiguradas: readonly SemanaConfiguradaResumo[];
}

export interface JanelaCapacidadeRecursosProps {
  base: BaseCenarios;
  /**
   * Fonte de verdade do motor NOVO (DEC-007, corrigida na Etapa C -
   * já exclui operações de subconjunto por padrão, ver
   * carregarNecessidadesOrcamentoNovo.ts) para os recursos
   * originais/compatíveis do seletor "Recurso" - NUNCA `base.ocorrencias`/
   * `base.compatibilidades` (árvore inteira do motor antigo, é o que
   * causava SOLD-001/PINT-001/CAL-001 aparecerem aqui mesmo pertencendo
   * só a subconjuntos). `base` continua usado para tudo o mais (valor-hora,
   * convenções, recurso de referência do temporário).
   */
  necessidadesOrcamentoNovo: readonly NecessidadeCapacidadeFlexivel[];
  empresaId: string;
  janelaInicio: string;
  prazoInterno: string;
  onCalcular: (decisoes: DecisoesCenario) => void;
  onResumoChange: (resumo: ResumoCapacidadeRecursos) => void;
  calculando?: boolean;
  /**
   * DEC-007 §6.2/Fase 8b (correção achada em teste visual real, projeto
   * 260011) - as 3 listas "já confirmadas" (regras, alternativos,
   * temporários) SUBIRAM para o componente pai
   * (CapacidadeRecursosConfiguracaoCard), que não desmonta ao fechar a
   * Modal - só este componente (filho da Modal) desmontava, perdendo
   * tudo a cada fechar/reabrir "Configurar" e arriscando um recálculo
   * substituir regras anteriores silenciosamente. Estado controlado
   * aqui sobrevive a fechar/reabrir dentro da mesma visita à página,
   * mas nunca precisa (nem deve) sobreviver a recarregar a página - o
   * pai também usa useState comum, sem persistência própria.
   */
  regrasInternas: RegraInterna[];
  setRegrasInternas: Dispatch<SetStateAction<RegraInterna[]>>;
  recursosAlternativos: string[];
  setRecursosAlternativos: Dispatch<SetStateAction<string[]>>;
  recursosTemporarios: RecursoTemporarioLocal[];
  setRecursosTemporarios: Dispatch<SetStateAction<RecursoTemporarioLocal[]>>;
}

interface RecursoOpcao {
  id: string;
  codigo: string;
  nome: string;
}

export interface RegraInterna {
  id: string;
  recursoId: string;
  /** Segunda-feira da semana desta regra - ver expandirRegraSemanal.ts (nunca repete para outra semana). */
  semanaInicio: string;
  dias: DiasRegraSemanal;
  horasPorDia: number;
  ativo: boolean;
}

export interface RecursoTemporarioLocal {
  recursoTemporario: RecursoTemporarioCenario;
  produtividadeReferencia: number;
  abrangencia: AbrangenciaContratacao;
  valor: number;
  fornecedorOuObservacao: string;
}

const DIAS_UTEIS_OPCOES: { value: DiaUtilSemana; label: string }[] = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
];

const OPCOES_TIPO_TEMPORARIO: { value: TipoRecursoTemporario; label: string }[] = [
  { value: "maquina_alugada", label: "Máquina alugada" },
  { value: "equipamento_adicional", label: "Equipamento adicional" },
  { value: "freelancer", label: "Freelancer" },
];

const OPCOES_ABRANGENCIA: { value: AbrangenciaContratacao; label: string }[] = [
  { value: "por_hora_utilizada", label: "Por hora utilizada" },
  { value: "por_dia_contratado", label: "Por dia contratado" },
  { value: "por_periodo_completo", label: "Por período completo" },
  { value: "valor_fixo_unico", label: "Valor fixo único" },
];

function diasVazios(): DiasRegraSemanal {
  return { diasUteis: [], sabado: false, domingo: false, feriado: false };
}

function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * DEC-007 §6.2/Fase 8b (correção achada em teste visual real, projeto
 * 260011 - 12/10 é feriado nacional) - data exata de um dia útil (1=
 * segunda..5=sexta) dentro da semana que começa em `semanaInicio`. Só
 * faz sentido para uma regra semanal (1 única semana, nunca um período
 * maior) - por isso vive aqui, não em expandirRegraSemanal.ts (genérico
 * a qualquer período).
 */
function dataDoDiaUtilNaSemana(semanaInicio: string, dia: DiaUtilSemana): string {
  const [ano, mes, diaMes] = semanaInicio.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, diaMes + (dia - 1))).toISOString().slice(0, 10);
}

function descreverSemana(semanaInicio: string): string {
  return `Semana de ${formatarDataBr(semanaInicio)} a ${formatarDataBr(calcularSemanaFim(semanaInicio))}`;
}

function descreverDias(dias: DiasRegraSemanal): string {
  const partes: string[] = [];
  if (dias.diasUteis.length > 0) {
    const nomes = dias.diasUteis
      .slice()
      .sort()
      .map((d) => DIAS_UTEIS_OPCOES.find((o) => o.value === d)?.label ?? String(d));
    partes.push(nomes.join(", "));
  }
  if (dias.sabado) partes.push("Sábado");
  if (dias.domingo) partes.push("Domingo");
  if (dias.feriado) partes.push("Feriado");
  return partes.length > 0 ? partes.join(" · ") : "—";
}

export function JanelaCapacidadeRecursos({
  base,
  necessidadesOrcamentoNovo,
  empresaId,
  janelaInicio,
  prazoInterno,
  onCalcular,
  onResumoChange,
  calculando,
  regrasInternas,
  setRegrasInternas,
  recursosAlternativos,
  setRecursosAlternativos,
  recursosTemporarios,
  setRecursosTemporarios,
}: JanelaCapacidadeRecursosProps) {
  const [recursos, setRecursos] = useState<RecursoOpcao[]>([]);
  const [carregandoRecursos, setCarregandoRecursos] = useState(true);
  const [erroRecursos, setErroRecursos] = useState<string | null>(null);

  const [contexto, setContexto] = useState<ContextoCalendario | null>(null);
  const [carregandoContexto, setCarregandoContexto] = useState(true);
  const [erroContexto, setErroContexto] = useState<string | null>(null);

  // DEC-007 §6.2/Fase 8b (correção achada em teste visual real, projeto
  // 260011 - RUNTIME ERROR ao navegar para uma semana fora da janela do
  // cenário) - `contexto` acima é carregado 1 única vez, estritamente
  // para [janelaInicio, prazoInterno] (o cálculo real nunca pede fora
  // disso, calcularJanelaEfetivaSemana recorta antes). A decoração visual
  // de feriado, por pedido explícito do usuário, precisa funcionar para
  // QUALQUER semana navegada no formulário de nova regra - inclusive
  // fora dessa janela. Em vez de alargar `contexto` (arriscaria reabrir
  // o N+1 que contextoCalendario.ts existe para evitar, e misturaria o
  // contrato do cálculo real com o da decoração), este é um contexto
  // SEPARADO, carregado sob demanda só para a semana do draft quando ela
  // cai fora de `contexto` - nunca usado por resolverNatureza/cálculo.
  const [contextoDecoracao, setContextoDecoracao] = useState<ContextoCalendario | null>(null);
  const [carregandoDecoracao, setCarregandoDecoracao] = useState(false);
  const [erroDecoracao, setErroDecoracao] = useState<string | null>(null);

  const [novoAlternativoId, setNovoAlternativoId] = useState("");

  const [draftRecursoId, setDraftRecursoId] = useState("");
  const [draftSemanaReferencia, setDraftSemanaReferencia] = useState("");
  const [draftDiasUteis, setDraftDiasUteis] = useState<Set<DiaUtilSemana>>(new Set());
  const [draftSabado, setDraftSabado] = useState(false);
  const [draftDomingo, setDraftDomingo] = useState(false);
  const [draftFeriado, setDraftFeriado] = useState(false);
  const [draftHorasPorDia, setDraftHorasPorDia] = useState("");
  const [erroRegra, setErroRegra] = useState<string | null>(null);

  const draftSemanaInicio = draftSemanaReferencia ? segundaDaSemana(draftSemanaReferencia) : "";

  const [mostrarFormTemporario, setMostrarFormTemporario] = useState(false);
  const [tempTipo, setTempTipo] = useState<TipoRecursoTemporario>("freelancer");
  const [tempNome, setTempNome] = useState("");
  const [tempReferenciaId, setTempReferenciaId] = useState("");
  const [tempProdutividade, setTempProdutividade] = useState<number | null>(null);
  const [tempResolvendoProdutividade, setTempResolvendoProdutividade] = useState(false);
  const [tempDataInicio, setTempDataInicio] = useState("");
  const [tempDataFim, setTempDataFim] = useState("");
  const [tempDiasUteis, setTempDiasUteis] = useState<Set<DiaUtilSemana>>(new Set());
  const [tempSabado, setTempSabado] = useState(false);
  const [tempDomingo, setTempDomingo] = useState(false);
  const [tempFeriado, setTempFeriado] = useState(false);
  const [tempHorasPorDia, setTempHorasPorDia] = useState("");
  const [tempAbrangencia, setTempAbrangencia] = useState<AbrangenciaContratacao>("valor_fixo_unico");
  const [tempValorTexto, setTempValorTexto] = useState("");
  const [tempFornecedor, setTempFornecedor] = useState("");
  const [erroTemporario, setErroTemporario] = useState<string | null>(null);

  const [erroCalculo, setErroCalculo] = useState<string | null>(null);

  // Só recursos REALMENTE disponíveis na base carregada.
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setCarregandoRecursos(true);
      setErroRecursos(null);
      if (base.recursoIds.length === 0) {
        if (!cancelado) {
          setRecursos([]);
          setCarregandoRecursos(false);
        }
        return;
      }
      const { data, error } = await supabase.from("recursos_produtivos").select("id,codigo,nome").in("id", base.recursoIds);
      if (cancelado) return;
      if (error) {
        setErroRecursos("Não foi possível carregar os recursos produtivos.");
        setRecursos([]);
      } else {
        setRecursos((data ?? []).slice().sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? "")));
      }
      setCarregandoRecursos(false);
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [base]);

  // Calendário carregado 1 única vez, cobrindo a janela produtiva
  // inteira - nunca refeito por regra.
  useEffect(() => {
    let cancelado = false;
    async function carregar() {
      setCarregandoContexto(true);
      setErroContexto(null);
      try {
        const ctx = await carregarContextoCalendario(supabase, empresaId, janelaInicio, prazoInterno);
        if (!cancelado) setContexto(ctx);
      } catch (erro) {
        if (!cancelado) {
          setContexto(null);
          setErroContexto(erro instanceof Error ? erro.message : "Não foi possível carregar o calendário.");
        }
      } finally {
        if (!cancelado) setCarregandoContexto(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [empresaId, janelaInicio, prazoInterno]);

  const resolverNatureza = useMemo(() => {
    return (data: string): NaturezaDia => {
      if (!contexto) return "normal";
      return derivarNaturezaDia(data, resolverDiaProdutivoComContexto(contexto, data));
    };
  }, [contexto]);

  // Carrega sob demanda um contexto pequeno (1 semana) cobrindo a semana
  // do draft quando ela cai fora de `contexto` - só o necessário para a
  // decoração visual de feriado, nunca reaproveitado pelo cálculo real.
  useEffect(() => {
    let cancelado = false;
    if (!draftSemanaInicio) return;
    const semanaFimDraft = calcularSemanaFim(draftSemanaInicio);
    const cobertoPeloPrincipal = Boolean(contexto) && draftSemanaInicio >= contexto!.dataInicio && semanaFimDraft <= contexto!.dataFim;
    const cobertoPelaDecoracao =
      Boolean(contextoDecoracao) && draftSemanaInicio >= contextoDecoracao!.dataInicio && semanaFimDraft <= contextoDecoracao!.dataFim;
    if (cobertoPeloPrincipal || cobertoPelaDecoracao) return;

    async function carregar() {
      setCarregandoDecoracao(true);
      setErroDecoracao(null);
      try {
        const ctx = await carregarContextoCalendario(supabase, empresaId, draftSemanaInicio, semanaFimDraft);
        if (!cancelado) setContextoDecoracao(ctx);
      } catch (erro) {
        if (!cancelado) {
          setErroDecoracao(erro instanceof Error ? erro.message : "Não foi possível verificar feriados nesta semana.");
        }
      } finally {
        if (!cancelado) setCarregandoDecoracao(false);
      }
    }
    carregar();
    return () => {
      cancelado = true;
    };
  }, [draftSemanaInicio, contexto, contextoDecoracao, empresaId]);

  // Combina os dois contextos (principal + decoração sob demanda) só
  // para a decoração visual - `null` significa "ainda não sei" (contexto
  // relevante ainda carregando/não pedido), NUNCA "não é feriado": um
  // fallback otimista aqui reintroduziria em silêncio o mesmo risco que
  // motivou a correção (deixar de marcar um feriado real).
  const resolverNaturezaDecoracao = useMemo(() => {
    return (data: string): NaturezaDia | null => {
      if (contexto && data >= contexto.dataInicio && data <= contexto.dataFim) {
        return derivarNaturezaDia(data, resolverDiaProdutivoComContexto(contexto, data));
      }
      if (contextoDecoracao && data >= contextoDecoracao.dataInicio && data <= contextoDecoracao.dataFim) {
        return derivarNaturezaDia(data, resolverDiaProdutivoComContexto(contextoDecoracao, data));
      }
      return null;
    };
  }, [contexto, contextoDecoracao]);

  // DEC-007 §6.2/Fase 8b (achado em teste visual real, projeto 260011 -
  // 12/10 é feriado nacional): mapa dia útil -> data exata, só para os
  // dias que caem em feriado dentro da semana escolhida - alimenta o
  // destaque visual e o aviso inline abaixo, NUNCA muda o resultado do
  // cálculo (expandirRegraSemanal.ts já exclui feriado de "dias úteis"
  // por conta própria, comportamento intencional e preexistente).
  const feriadosNaSemanaDraft = useMemo(() => {
    const mapa = new Map<DiaUtilSemana, string>();
    if (!draftSemanaInicio) return mapa;
    for (const opcao of DIAS_UTEIS_OPCOES) {
      const data = dataDoDiaUtilNaSemana(draftSemanaInicio, opcao.value);
      if (resolverNaturezaDecoracao(data) === "feriado") {
        mapa.set(opcao.value, data);
      }
    }
    return mapa;
  }, [draftSemanaInicio, resolverNaturezaDecoracao]);

  const diasUteisFeriadoSemMarcarFeriado = useMemo(
    () => Array.from(draftDiasUteis).filter((dia) => feriadosNaSemanaDraft.has(dia)),
    [draftDiasUteis, feriadosNaSemanaDraft],
  );

  const linhasOriginais = useMemo(
    () => recursosOriginaisDeNecessidades(necessidadesOrcamentoNovo),
    [necessidadesOrcamentoNovo],
  );

  const idsCompativeis = useMemo(
    () => recursosCompativeisDeNecessidades(necessidadesOrcamentoNovo),
    [necessidadesOrcamentoNovo],
  );

  // Regra de negócio (DEC-007, achada em teste visual real - projeto
  // 260011): trocar de base/projeto nunca deixa uma regra ou um recurso
  // alternativo já configurado continuar valendo silenciosamente para um
  // recurso que saiu do escopo atual (linhasOriginais/idsCompativeis).
  // Ajuste de estado durante o RENDER (padrão oficial do React,
  // comparação com "chave anterior") - nunca via useEffect, para o hazard
  // de setState síncrono não existir nem escondido (ver
  // feedback_nao_esconder_setstate_sincrono_via_aninhamento).
  const chaveEscopoRecursos = `${linhasOriginais.join(",")}|${[...idsCompativeis].sort().join(",")}`;
  const [chaveEscopoRecursosAplicada, setChaveEscopoRecursosAplicada] = useState(chaveEscopoRecursos);
  if (chaveEscopoRecursos !== chaveEscopoRecursosAplicada) {
    setChaveEscopoRecursosAplicada(chaveEscopoRecursos);
    const configuracaoValida = invalidarConfiguracaoForaDeEscopo(
      { recursosAlternativos, regras: regrasInternas },
      linhasOriginais,
      idsCompativeis,
    );
    if (configuracaoValida.recursosAlternativos !== recursosAlternativos) {
      setRecursosAlternativos([...configuracaoValida.recursosAlternativos]);
    }
    if (configuracaoValida.regras !== regrasInternas) {
      setRegrasInternas([...configuracaoValida.regras]);
    }
  }

  const opcoesAlternativas = useMemo(
    () =>
      recursos.filter(
        (r) => idsCompativeis.has(r.id) && !linhasOriginais.includes(r.id) && !recursosAlternativos.includes(r.id),
      ),
    [recursos, idsCompativeis, linhasOriginais, recursosAlternativos],
  );

  const recursosDisponiveisParaRegra = useMemo(
    () => [...linhasOriginais.map((id) => ({ id, origem: "original" as const })), ...recursosAlternativos.map((id) => ({ id, origem: "alternativo" as const }))],
    [linhasOriginais, recursosAlternativos],
  );

  function nomeRecurso(id: string): string {
    const recurso = recursos.find((r) => r.id === id);
    return recurso ? [recurso.codigo, recurso.nome].filter(Boolean).join(" - ") : id;
  }

  function alternarDiaUtil(conjunto: Set<DiaUtilSemana>, dia: DiaUtilSemana, setConjunto: (v: Set<DiaUtilSemana>) => void) {
    const copia = new Set(conjunto);
    if (copia.has(dia)) copia.delete(dia);
    else copia.add(dia);
    setConjunto(copia);
  }

  function handleIncluirAlternativo() {
    if (!novoAlternativoId) return;
    setRecursosAlternativos((atual) => [...atual, novoAlternativoId]);
    setNovoAlternativoId("");
  }

  function handleRemoverAlternativo(id: string) {
    setRecursosAlternativos((atual) => atual.filter((x) => x !== id));
    setRegrasInternas((atual) => atual.filter((r) => r.recursoId !== id));
  }

  function handleAdicionarRegra() {
    setErroRegra(null);

    if (!draftRecursoId) {
      setErroRegra("Selecione um recurso.");
      return;
    }
    if (!draftSemanaReferencia) {
      setErroRegra("Selecione uma data dentro da semana em que a regra deve valer.");
      return;
    }
    const semanaInicio = segundaDaSemana(draftSemanaReferencia);
    const janelaEfetiva = calcularJanelaEfetivaSemana({ semanaInicio, janelaInicio, janelaFim: prazoInterno });
    if (!janelaEfetiva) {
      setErroRegra(
        `${descreverSemana(semanaInicio)} não tem nenhuma interseção com a janela do cenário (${formatarDataBr(janelaInicio)} a ${formatarDataBr(prazoInterno)}) - a regra não geraria nenhuma capacidade. Escolha uma semana dentro do período do cenário.`,
      );
      return;
    }

    const horas = Number(draftHorasPorDia.replace(",", "."));
    const dias: DiasRegraSemanal = {
      diasUteis: Array.from(draftDiasUteis),
      sabado: draftSabado,
      domingo: draftDomingo,
      feriado: draftFeriado,
    };

    const candidata: RegraSemanalCapacidadeExtra = { recursoId: draftRecursoId, semanaInicio, dias, horasPorDia: horas, ativo: true };

    try {
      // Reaproveita a própria validação de expandirRegraSemanal (dias/
      // horas/semana) - nunca uma segunda checagem duplicada.
      expandirRegraSemanal({ dias, horasPorDia: horas, ativo: true, ...janelaEfetiva, resolverNatureza });
    } catch (erro) {
      setErroRegra(erro instanceof Error ? erro.message : "Regra inválida.");
      return;
    }

    const regrasExistentes: RegraSemanalCapacidadeExtra[] = regrasInternas.map((r) => ({
      recursoId: r.recursoId,
      semanaInicio: r.semanaInicio,
      dias: r.dias,
      horasPorDia: r.horasPorDia,
      ativo: r.ativo,
    }));
    const conflito = encontrarRegraConflitante(regrasExistentes, candidata);
    if (conflito) {
      setErroRegra(
        `Já existe uma regra ativa para ${nomeRecurso(draftRecursoId)} na ${descreverSemana(semanaInicio)} com pelo menos um dia em comum (${descreverDias(conflito.dias)}) - remova ou desative a regra existente antes de adicionar esta, em vez de somar horas silenciosamente.`,
      );
      return;
    }

    const dataSemConvencao = encontrarDataSemConvencaoAplicavel({
      regras: [candidata],
      janelaInicio,
      janelaFim: prazoInterno,
      resolverNatureza,
      convencoes: base.convencoesHorasAdicionais,
    });
    if (dataSemConvencao) {
      setErroRegra(`Não há convenção coletiva vigente para o dia ${dataSemConvencao} - configure a convenção antes de autorizar hora adicional nesta data.`);
      return;
    }

    setRegrasInternas((atual) => [...atual, { id: crypto.randomUUID(), recursoId: draftRecursoId, semanaInicio, dias, horasPorDia: horas, ativo: true }]);
    setDraftSemanaReferencia("");
    setDraftDiasUteis(new Set());
    setDraftSabado(false);
    setDraftDomingo(false);
    setDraftFeriado(false);
    setDraftHorasPorDia("");
  }

  function handleRemoverRegra(id: string) {
    setRegrasInternas((atual) => atual.filter((r) => r.id !== id));
  }

  function handleAlternarAtivo(id: string) {
    setRegrasInternas((atual) => atual.map((r) => (r.id === id ? { ...r, ativo: !r.ativo } : r)));
  }

  async function handleSelecionarReferencia(id: string) {
    setTempReferenciaId(id);
    setTempProdutividade(null);
    setErroTemporario(null);
    if (!id) return;
    setTempResolvendoProdutividade(true);
    try {
      const produtividade = await resolverProdutividadeRecurso(supabase, id);
      setTempProdutividade(produtividade);
    } catch {
      setErroTemporario("Não foi possível resolver a produtividade do recurso de referência.");
    } finally {
      setTempResolvendoProdutividade(false);
    }
  }

  function handleCriarRecursoTemporario() {
    setErroTemporario(null);
    if (!tempNome.trim()) {
      setErroTemporario('Informe um nome para o recurso temporário (ex.: "Solda 2").');
      return;
    }
    if (!tempReferenciaId || tempProdutividade === null) {
      setErroTemporario("Selecione um recurso interno de referência (para herdar a produtividade).");
      return;
    }
    if (!tempDataInicio || !tempDataFim) {
      setErroTemporario("Informe o período disponível.");
      return;
    }

    const horas = Number(tempHorasPorDia.replace(",", "."));
    const dias: DiasRegraSemanal = { diasUteis: Array.from(tempDiasUteis), sabado: tempSabado, domingo: tempDomingo, feriado: tempFeriado };

    let expandido;
    try {
      expandido = expandirRegraSemanal({ dias, horasPorDia: horas, ativo: true, dataInicio: tempDataInicio, dataFim: tempDataFim, resolverNatureza });
    } catch (erro) {
      setErroTemporario(erro instanceof Error ? erro.message : "Regra de disponibilidade inválida.");
      return;
    }
    if (expandido.length === 0) {
      setErroTemporario("Nenhum dia disponível nesse período com os dias/naturezas marcados.");
      return;
    }

    const valor = Number(tempValorTexto.replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0) {
      setErroTemporario("Informe um valor de custo válido (número não negativo).");
      return;
    }

    const novoRecurso: RecursoTemporarioLocal = {
      recursoTemporario: {
        idTemporario: crypto.randomUUID(),
        tipo: tempTipo,
        recursoReferenciaId: tempReferenciaId,
        disponibilidade: expandido.map(({ data, horas: h }) => ({ data, horasDisponiveis: h })),
        contratacaoId: crypto.randomUUID(),
        justificativa: tempNome.trim(),
        aplicavelAsOperacoes: ocorrenciasAplicaveisARecurso(base, tempReferenciaId),
      },
      produtividadeReferencia: tempProdutividade,
      abrangencia: tempAbrangencia,
      valor,
      fornecedorOuObservacao: tempFornecedor,
    };

    setRecursosTemporarios((atual) => [...atual, novoRecurso]);
    setMostrarFormTemporario(false);
    setTempNome("");
    setTempReferenciaId("");
    setTempProdutividade(null);
    setTempDataInicio("");
    setTempDataFim("");
    setTempDiasUteis(new Set());
    setTempSabado(false);
    setTempDomingo(false);
    setTempFeriado(false);
    setTempHorasPorDia("");
    setTempValorTexto("");
    setTempFornecedor("");
  }

  function handleRemoverRecursoTemporario(idTemporario: string) {
    setRecursosTemporarios((atual) => atual.filter((r) => r.recursoTemporario.idTemporario !== idTemporario));
  }

  function handleCalcular() {
    setErroCalculo(null);

    const regrasParaMotor: RegraSemanalCapacidadeExtra[] = regrasInternas.map((r) => ({
      recursoId: r.recursoId,
      semanaInicio: r.semanaInicio,
      dias: r.dias,
      horasPorDia: r.horasPorDia,
      ativo: r.ativo,
    }));

    const dataSemConvencao = encontrarDataSemConvencaoAplicavel({
      regras: regrasParaMotor,
      janelaInicio,
      janelaFim: prazoInterno,
      resolverNatureza,
      convencoes: base.convencoesHorasAdicionais,
    });
    if (dataSemConvencao) {
      setErroCalculo(`Não há convenção coletiva vigente para o dia ${dataSemConvencao} - configure a convenção antes de calcular.`);
      return;
    }

    let decisoesCapacidadeExtra: DecisoesCenario;
    try {
      decisoesCapacidadeExtra = construirDecisoesCapacidadeExtraDeRegras({
        regras: regrasParaMotor,
        janelaInicio,
        janelaFim: prazoInterno,
        resolverNatureza,
        valorHoraPorRecurso: base.valorHoraPorRecurso,
        convencoes: base.convencoesHorasAdicionais,
      });
    } catch (erro) {
      setErroCalculo(erro instanceof Error ? erro.message : "Não foi possível calcular as regras de capacidade.");
      return;
    }

    const itensTemporarios: RecursoTemporarioParaConstruir[] = recursosTemporarios.map((r) => ({
      recursoTemporario: r.recursoTemporario,
      produtividadeReferencia: r.produtividadeReferencia,
      abrangencia: r.abrangencia,
      valor: r.valor,
      fornecedorOuObservacao: r.fornecedorOuObservacao,
    }));
    const decisoesRecursoTemporario = construirDecisoesRecursoTemporario(itensTemporarios);

    const combinado = combinarDecisoesCenario([decisoesCapacidadeExtra, decisoesRecursoTemporario]);
    onCalcular(combinado);

    const recursosAjustadosSet = new Set(regrasInternas.filter((r) => r.ativo).map((r) => r.recursoId));
    const horasDisponibilizadas = decisoesCapacidadeExtra.capacidadeExtra.reduce((soma, c) => soma + c.horasAdicionaisDisponiveis, 0);

    // Custo POTENCIAL MÁXIMO - "se toda hora disponibilizada fosse usada".
    // Nunca o custo real do cenário (esse só existe depois de
    // avaliarCenario, fora deste componente) - rotulado explicitamente
    // como potencial no cartão de comparação, para nunca ser confundido
    // com o custo efetivamente utilizado.
    const horasUsadasComoSeTotalUsado = new Map<string, number>();
    for (const c of decisoesCapacidadeExtra.capacidadeExtra) {
      horasUsadasComoSeTotalUsado.set(c.contratacaoId, (horasUsadasComoSeTotalUsado.get(c.contratacaoId) ?? 0) + c.horasAdicionaisDisponiveis);
    }
    for (const r of recursosTemporarios) {
      const totalHoras = r.recursoTemporario.disponibilidade.reduce((soma, dia) => soma + dia.horasDisponiveis, 0);
      horasUsadasComoSeTotalUsado.set(r.recursoTemporario.contratacaoId, totalHoras);
    }
    const custoPotencial = calcularCustoContratacoes({
      contratacoes: combinado.contratacoes,
      horasUsadasPorContratacaoId: horasUsadasComoSeTotalUsado,
    });

    const semanasConfiguradas: SemanaConfiguradaResumo[] = regrasInternas
      .filter((r) => r.ativo)
      .map((r) => {
        const janelaEfetiva = calcularJanelaEfetivaSemana({ semanaInicio: r.semanaInicio, janelaInicio, janelaFim: prazoInterno });
        const horas = janelaEfetiva
          ? expandirRegraSemanal({
              dias: r.dias,
              horasPorDia: r.horasPorDia,
              ativo: true,
              ...janelaEfetiva,
              resolverNatureza,
            }).reduce((soma, d) => soma + d.horas, 0)
          : 0;
        return {
          semanaInicio: r.semanaInicio,
          semanaFim: calcularSemanaFim(r.semanaInicio),
          recursoNome: nomeRecurso(r.recursoId),
          horasDisponibilizadas: horas,
        };
      });

    onResumoChange({
      recursosAjustados: recursosAjustadosSet.size,
      horasAdicionaisDisponibilizadas: horasDisponibilizadas,
      recursosAlternativos: recursosAlternativos.length,
      recursosTemporarios: recursosTemporarios.length,
      custoPotencialMaximo: custoPotencial.custoTotal,
      semanasConfiguradas,
    });
  }

  const semConvencaoVigente = base.convencoesHorasAdicionais.length === 0;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      {erroRecursos ? <p className="text-[12.5px] text-status-danger-text">{erroRecursos}</p> : null}
      {erroContexto ? <p className="text-[12.5px] text-status-danger-text">{erroContexto}</p> : null}
      {carregandoRecursos || carregandoContexto ? <p className="text-[12.5px] text-text-secondary">Carregando...</p> : null}

      {semConvencaoVigente ? (
        <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-[12.5px] text-text-primary">
          Nenhuma convenção coletiva cadastrada cobrindo este período - regras de hora adicional em recursos internos
          ficam bloqueadas até que uma seja registrada em Configurações → Convenção coletiva.
        </p>
      ) : null}

      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <p className="mb-3 text-[13px] font-semibold text-text-primary">Recursos internos - regras de hora adicional</p>

        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Select
            label="Incluir recurso interno alternativo"
            value={novoAlternativoId}
            onChange={(event) => setNovoAlternativoId(event.target.value)}
            placeholder={opcoesAlternativas.length === 0 ? "Nenhum recurso compatível disponível" : "Selecione"}
            disabled={opcoesAlternativas.length === 0}
            options={opcoesAlternativas.map((r) => ({ value: r.id, label: [r.codigo, r.nome].filter(Boolean).join(" - ") }))}
          />
          <Button variant="secondary" onClick={handleIncluirAlternativo} disabled={!novoAlternativoId}>
            + Incluir recurso interno
          </Button>
        </div>

        {regrasInternas.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            {regrasInternas.map((regra) => (
              <div key={regra.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle px-3 py-2 text-[12.5px]">
                <span className="text-text-primary">
                  <strong>{nomeRecurso(regra.recursoId)}</strong> · {descreverSemana(regra.semanaInicio)} · {descreverDias(regra.dias)} ·{" "}
                  {regra.horasPorDia}h/dia
                  {!regra.ativo ? <span className="text-text-disabled"> · inativa</span> : null}
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleAlternarAtivo(regra.id)} className="font-semibold text-action-primary hover:underline">
                    {regra.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button type="button" onClick={() => handleRemoverRegra(regra.id)} className="font-semibold text-status-danger-text hover:underline">
                    Remover
                  </button>
                  {recursosAlternativos.includes(regra.recursoId) ? (
                    <button type="button" onClick={() => handleRemoverAlternativo(regra.recursoId)} className="font-semibold text-status-danger-text hover:underline">
                      Remover recurso
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-[12.5px] text-text-secondary">Nenhuma regra adicionada ainda.</p>
        )}

        <p className="mb-2 text-[12.5px] font-semibold text-text-secondary">+ Adicionar regra</p>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Recurso"
            value={draftRecursoId}
            onChange={(event) => setDraftRecursoId(event.target.value)}
            placeholder="Selecione"
            options={recursosDisponiveisParaRegra.map((r) => ({ value: r.id, label: nomeRecurso(r.id) }))}
          />
          <Field
            label="Semana (escolha qualquer dia dela)"
            type="date"
            value={draftSemanaReferencia}
            onChange={(e) => setDraftSemanaReferencia(e.target.value)}
          />
          <Field label="Horas adicionais/dia" inputMode="decimal" value={draftHorasPorDia} onChange={(e) => setDraftHorasPorDia(e.target.value)} />
        </div>
        {draftSemanaInicio ? (
          <p className="mt-1.5 text-[12px] text-text-secondary">{descreverSemana(draftSemanaInicio)} - regra vale só nesta semana, nunca se repete.</p>
        ) : null}
        {draftSemanaInicio && carregandoDecoracao ? (
          <p className="mt-1 text-[12px] text-text-secondary">Verificando feriados nesta semana...</p>
        ) : null}
        {erroDecoracao ? (
          <p className="mt-1 text-[12px] text-status-danger-text">
            Não foi possível verificar feriados nesta semana para o aviso visual - o cálculo real não é afetado, mas confira manualmente antes de salvar. ({erroDecoracao})
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIAS_UTEIS_OPCOES.map((opcao) => {
            const dataFeriado = feriadosNaSemanaDraft.get(opcao.value);
            return (
              <Button
                key={opcao.value}
                variant={draftDiasUteis.has(opcao.value) ? "primary" : "secondary"}
                onClick={() => alternarDiaUtil(draftDiasUteis, opcao.value, setDraftDiasUteis)}
                title={dataFeriado ? `Feriado — ${formatarDataBr(dataFeriado)}` : undefined}
                className={dataFeriado ? "text-status-danger-text ring-2 ring-inset ring-status-danger-border" : undefined}
              >
                {opcao.label}
                {dataFeriado ? " ⚠" : ""}
              </Button>
            );
          })}
          <Button variant={draftSabado ? "primary" : "secondary"} onClick={() => setDraftSabado((v) => !v)}>
            Sábado
          </Button>
          <Button variant={draftDomingo ? "primary" : "secondary"} onClick={() => setDraftDomingo((v) => !v)}>
            Domingo
          </Button>
          <Button variant={draftFeriado ? "primary" : "secondary"} onClick={() => setDraftFeriado((v) => !v)}>
            Feriado
          </Button>
        </div>
        {diasUteisFeriadoSemMarcarFeriado.length > 0 && !draftFeriado ? (
          <p className="mt-2 text-[12px] text-status-danger-text">
            {diasUteisFeriadoSemMarcarFeriado
              .map((dia) => `${DIAS_UTEIS_OPCOES.find((o) => o.value === dia)?.label} (${formatarDataBr(feriadosNaSemanaDraft.get(dia)!)})`)
              .join(", ")}{" "}
            {diasUteisFeriadoSemMarcarFeriado.length === 1 ? "é feriado" : "são feriado"} - só conta horas se
            &quot;Feriado&quot; também estiver marcado, senão essa data fica de fora do cálculo (dia selecionado
            continua salvo, nada é bloqueado).
          </p>
        ) : null}
        {erroRegra ? <p className="mt-2 text-[12.5px] text-status-danger-text">{erroRegra}</p> : null}
        <div className="mt-3">
          <Button onClick={handleAdicionarRegra}>Adicionar regra</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle bg-surface p-4">
        <p className="mb-3 text-[13px] font-semibold text-text-primary">Recursos temporários</p>

        {recursosTemporarios.length > 0 ? (
          <div className="mb-3 flex flex-col gap-2">
            {recursosTemporarios.map((rt) => (
              <div key={rt.recursoTemporario.idTemporario} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle px-3 py-2 text-[12.5px]">
                <span className="text-text-primary">
                  {rt.recursoTemporario.justificativa} · {rt.recursoTemporario.disponibilidade.length} dia(s) disponíveis
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoverRecursoTemporario(rt.recursoTemporario.idTemporario)}
                  className="font-semibold text-status-danger-text hover:underline"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-[12.5px] text-text-secondary">Nenhum recurso temporário criado ainda.</p>
        )}

        {mostrarFormTemporario ? (
          <div className="rounded-md border border-border-subtle p-3">
            <div className="flex flex-wrap items-start gap-3">
              <Select label="Tipo" value={tempTipo} onChange={(e) => setTempTipo(e.target.value as TipoRecursoTemporario)} options={OPCOES_TIPO_TEMPORARIO} />
              <Field label="Nome do cenário" placeholder='Ex.: "Solda 2"' value={tempNome} onChange={(e) => setTempNome(e.target.value)} />
              <Select
                label="Recurso interno de referência"
                value={tempReferenciaId}
                onChange={(e) => handleSelecionarReferencia(e.target.value)}
                placeholder="Selecione"
                options={recursos.map((r) => ({ value: r.id, label: [r.codigo, r.nome].filter(Boolean).join(" - ") }))}
              />
              <Field label="Período - início" type="date" value={tempDataInicio} onChange={(e) => setTempDataInicio(e.target.value)} />
              <Field label="Período - fim" type="date" value={tempDataFim} onChange={(e) => setTempDataFim(e.target.value)} />
              <Field label="Horas disponíveis/dia" inputMode="decimal" value={tempHorasPorDia} onChange={(e) => setTempHorasPorDia(e.target.value)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {DIAS_UTEIS_OPCOES.map((opcao) => (
                <Button
                  key={opcao.value}
                  variant={tempDiasUteis.has(opcao.value) ? "primary" : "secondary"}
                  onClick={() => alternarDiaUtil(tempDiasUteis, opcao.value, setTempDiasUteis)}
                >
                  {opcao.label}
                </Button>
              ))}
              <Button variant={tempSabado ? "primary" : "secondary"} onClick={() => setTempSabado((v) => !v)}>
                Sábado
              </Button>
              <Button variant={tempDomingo ? "primary" : "secondary"} onClick={() => setTempDomingo((v) => !v)}>
                Domingo
              </Button>
              <Button variant={tempFeriado ? "primary" : "secondary"} onClick={() => setTempFeriado((v) => !v)}>
                Feriado
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <Select label="Forma de custeio" value={tempAbrangencia} onChange={(e) => setTempAbrangencia(e.target.value as AbrangenciaContratacao)} options={OPCOES_ABRANGENCIA} />
              <Field label="Valor do custo (R$)" inputMode="decimal" value={tempValorTexto} onChange={(e) => setTempValorTexto(e.target.value)} />
              <Field label="Fornecedor/observação (opcional)" value={tempFornecedor} onChange={(e) => setTempFornecedor(e.target.value)} />
            </div>
            {tempResolvendoProdutividade ? <p className="mt-2 text-[12.5px] text-text-secondary">Resolvendo produtividade...</p> : null}
            {erroTemporario ? <p className="mt-2 text-[12.5px] text-status-danger-text">{erroTemporario}</p> : null}
            <div className="mt-3 flex gap-2">
              <Button onClick={handleCriarRecursoTemporario} disabled={tempResolvendoProdutividade}>
                Criar recurso temporário
              </Button>
              <Button variant="ghost" onClick={() => setMostrarFormTemporario(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setMostrarFormTemporario(true)}>
            + Criar recurso temporário
          </Button>
        )}
      </div>

      {erroCalculo ? <p className="text-[12.5px] text-status-danger-text">{erroCalculo}</p> : null}

      <div className="flex justify-end">
        <Button onClick={handleCalcular} disabled={calculando}>
          {calculando ? "Calculando..." : "Calcular cenário ajustado"}
        </Button>
      </div>
    </div>
  );
}
