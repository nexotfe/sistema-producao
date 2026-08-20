// DEC-007 - previsão comercial por capacidade: ponte entre a lib pura
// (carregarBasePrevisaoComercial.ts/montarPrevisaoComercialProjeto.ts) e
// a tela `/projetos/[id]/cenarios`. "Base carregada uma vez" vira, aqui,
// um único `useEffect` cujo array de dependências NUNCA inclui
// `cenarioAjustado` - mudar hora extra/recurso temporário/antecipação
// de material só dispara o `useMemo` de `saidaAtual`/`saidaAjustada`
// (síncrono, em memória), nunca uma nova consulta ao Supabase.
// `saidaAtual` e `saidaAjustada` são SEMPRE derivadas do mesmo objeto
// `base` (a mesma referência, congelada por carregarBasePrevisaoComercial.ts)
// - nunca duas bases diferentes.
//
// CORREÇÃO (achada em teste visual real, projeto 260011, DEC-007):
// `janelaInicioGrade` (novo parâmetro, resolvido pelo CHAMADOR como a
// aprovação prevista - o piso mais cedo plausível) substitui o antigo
// uso de `janelaComercial.dataDisponibilidadeProducao` como início da
// GRADE - a grade agora é larga o bastante para cobrir tanto a
// disponibilidade original de material quanto uma data negociada
// ANTERIOR, sem nunca precisar recarregar a base. `janelaComercial.dataDisponibilidadeProducao`
// continua sendo usado para 2 coisas que NUNCA variam por cenário: (1)
// `dataReferenciaConfirmados` (piso dos projetos já confirmados -
// material do orçamento novo nunca os afeta) e (2) a disponibilidade
// ORIGINAL de material do "Cenário atual".
//
// Sessão autenticada normal (nunca service_role) - mesmo padrão de
// `buscarEmpresaId` já usado em GeradorComparadorCenarios.tsx (duplicado
// aqui de propósito: convenção já estabelecida no módulo de manter essa
// função pequena local a cada componente/hook que precisa dela, em vez
// de uma dependência cruzada nova).
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { carregarBasePrevisaoComercial, type BasePrevisaoComercial } from "@/modules/simulacao-comercial/lib/cenarios/carregarBasePrevisaoComercial";
import {
  montarPrevisaoComercialProjeto,
  type CenarioParaPrevisaoComercial,
  type SaidaPrevisaoComercial,
} from "@/modules/simulacao-comercial/lib/cenarios/montarPrevisaoComercialProjeto";
import { carregarNomesDiagnostico, type NomesDiagnostico } from "@/modules/simulacao-comercial/lib/cenarios/carregarNomesDiagnostico";
import type { ResultadoJanelaComercial } from "@/modules/simulacao-comercial/lib/prepararJanelaComercial";
import type { CapacidadeExtraDia } from "@/modules/simulacao-comercial/lib/cenarios/capacidadeDia";
import type { DecisaoRecursoTemporario } from "@/modules/simulacao-comercial/lib/cenarios/avaliarCenario";
import type { Contratacao } from "@/modules/simulacao-comercial/lib/cenarios/contratacao";

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

/**
 * Entrada do CHAMADOR (GeradorComparadorCenarios.tsx) para o "Cenário
 * ajustado" - mais simples que `CenarioParaPrevisaoComercial` (a
 * disponibilidade de material fica como "negociada ou null", nunca um
 * valor final resolvido; este hook resolve o fallback para a
 * disponibilidade original internamente, já que só ele tem
 * `janelaComercial` disponível).
 */
export interface CenarioAjustadoPrevisao {
  readonly capacidadeExtraAutorizada: readonly CapacidadeExtraDia[];
  readonly temporariosPorPrioridade: readonly DecisaoRecursoTemporario[];
  /** null = nenhuma negociação de material configurada ainda - cenário ajustado usa a mesma disponibilidade original do "Cenário atual" enquanto isso. */
  readonly disponibilidadeMaterialNegociada: string | null;
  /** Contratações referenciadas por capacidadeExtraAutorizada/temporariosPorPrioridade neste cenário - nunca a de negociação de material. */
  readonly contratacoes: readonly Contratacao[];
  /** null = nenhuma negociação de material configurada ainda. */
  readonly contratacaoNegociacaoMaterial: Contratacao | null;
}

export interface ResultadoPrevisaoComercialCapacidade {
  readonly base: BasePrevisaoComercial | null;
  readonly carregandoBase: boolean;
  readonly erroBase: string | null;
  /** Cenário sem nenhuma alternativa autorizada, disponibilidade de material ORIGINAL - sempre calculado quando `base` existe. */
  readonly saidaAtual: SaidaPrevisaoComercial | null;
  /** null enquanto `cenarioAjustado` for null (nenhuma alternativa configurada ainda) - nunca um cálculo "vazio" fingido. */
  readonly saidaAjustada: SaidaPrevisaoComercial | null;
  /** recursoId -> "código - nome" (mesmo formato de carregarNomesDiagnostico.ts). Fallback para o ID cru é responsabilidade de quem exibe, nunca deste hook. */
  readonly nomesRecursos: NomesDiagnostico["recursos"];
}

export function usePrevisaoComercialCapacidade(params: {
  projetoId: string;
  janelaComercial: ResultadoJanelaComercial | null;
  dataSolicitadaCliente: string;
  /** Piso da GRADE (não da disponibilidade de material em si) - resolvido pelo CHAMADOR, tipicamente a aprovação prevista (mais cedo que a disponibilidade original, para cobrir negociação futura sem nova consulta). */
  janelaInicioGrade: string;
  /** null = nenhuma alternativa configurada ainda (nem material, nem capacidade) - saidaAjustada fica null, nunca 0/false fingidos. */
  cenarioAjustado: CenarioAjustadoPrevisao | null;
}): ResultadoPrevisaoComercialCapacidade {
  const { projetoId, janelaComercial, dataSolicitadaCliente, janelaInicioGrade, cenarioAjustado } = params;

  // Estado bruto nunca é limpo sincronamente dentro do efeito quando a
  // janela deixa de ser válida (react-hooks/set-state-in-effect) - mesmo
  // padrão já usado em GeradorComparadorCenarios.tsx para carregarBaseCenarios:
  // `base` (derivado abaixo) é quem realmente reflete "há uma base válida
  // para esta janela AGORA".
  const [baseCarregada, setBaseCarregada] = useState<BasePrevisaoComercial | null>(null);
  const [carregandoBase, setCarregandoBase] = useState(false);
  const [erroBase, setErroBase] = useState<string | null>(null);
  const base = janelaComercial?.valida ? baseCarregada : null;

  // "Base congelada uma vez": o array de dependências abaixo NUNCA inclui
  // `cenarioAjustado` - é isto que garante, estruturalmente, que
  // configurar hora extra/recurso temporário/material nunca dispara uma
  // nova consulta (só o useMemo de saidaAtual/saidaAjustada, mais abaixo).
  useEffect(() => {
    let cancelado = false;

    if (!janelaComercial?.valida) {
      return;
    }

    async function carregar() {
      setCarregandoBase(true);
      setErroBase(null);
      try {
        const empresaId = await buscarEmpresaId();
        if (!empresaId) {
          throw new Error("Usuário não autenticado.");
        }
        const novaBase = await carregarBasePrevisaoComercial(
          supabase,
          empresaId,
          projetoId,
          dataSolicitadaCliente,
          janelaInicioGrade,
          janelaComercial!.dataDisponibilidadeProducao,
          janelaComercial!.prazoInterno,
        );
        if (!cancelado) {
          setBaseCarregada(novaBase);
        }
      } catch (erroCapturado) {
        if (!cancelado) {
          setBaseCarregada(null);
          setErroBase(erroCapturado instanceof Error ? erroCapturado.message : "Não foi possível carregar a previsão comercial por capacidade.");
        }
      } finally {
        if (!cancelado) {
          setCarregandoBase(false);
        }
      }
    }

    carregar();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetoId, janelaComercial?.valida, janelaComercial?.dataDisponibilidadeProducao, janelaComercial?.prazoInterno, dataSolicitadaCliente, janelaInicioGrade]);

  // "Cenário atual": disponibilidade ORIGINAL de material
  // (janelaComercial.dataDisponibilidadeProducao - a mesma usada como
  // dataReferenciaConfirmados, nunca a grade larga), nenhuma alternativa
  // autorizada. Nova instância só quando a disponibilidade original
  // muda (não a cada render) - preserva "cenários avaliados sobre bases
  // independentes".
  const cenarioAtual: CenarioParaPrevisaoComercial | null = useMemo(() => {
    if (!janelaComercial?.valida) return null;
    return {
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      disponibilidadeMaterialOrcamentoNovo: janelaComercial.dataDisponibilidadeProducao,
      contratacoes: [],
      contratacaoNegociacaoMaterial: null,
    };
  }, [janelaComercial]);

  // "Cenário ajustado": usa a disponibilidade NEGOCIADA quando
  // configurada, senão cai para a mesma disponibilidade original do
  // "Cenário atual" (nunca um piso fabricado) - só este hook resolve
  // esse fallback, porque só ele tem janelaComercial disponível.
  const cenarioAjustadoResolvido: CenarioParaPrevisaoComercial | null = useMemo(() => {
    if (!cenarioAjustado || !janelaComercial?.valida) return null;
    return {
      capacidadeExtraAutorizada: cenarioAjustado.capacidadeExtraAutorizada,
      temporariosPorPrioridade: cenarioAjustado.temporariosPorPrioridade,
      disponibilidadeMaterialOrcamentoNovo: cenarioAjustado.disponibilidadeMaterialNegociada ?? janelaComercial.dataDisponibilidadeProducao,
      contratacoes: cenarioAjustado.contratacoes,
      contratacaoNegociacaoMaterial: cenarioAjustado.contratacaoNegociacaoMaterial,
    };
  }, [cenarioAjustado, janelaComercial]);

  // Puro e síncrono - reavaliado em memória a cada mudança de
  // cenarioAtual/cenarioAjustadoResolvido, SEMPRE sobre a mesma
  // referência de `base`. Nenhuma chamada de rede aqui.
  const saidaAtual = useMemo(() => (base && cenarioAtual ? montarPrevisaoComercialProjeto(base, cenarioAtual) : null), [base, cenarioAtual]);
  const saidaAjustada = useMemo(
    () => (base && cenarioAjustadoResolvido ? montarPrevisaoComercialProjeto(base, cenarioAjustadoResolvido) : null),
    [base, cenarioAjustadoResolvido],
  );

  // Nomes dos recursos determinantes E de todo recurso do detalhamento
  // por recurso (correção de transparência, DEC-007 §6.2) - mesmo
  // padrão de "só recarrega se o CONJUNTO de IDs mudar" já usado em
  // GeradorComparadorCenarios.tsx (chaveIdsParaNomes/nomesDiagnosticoCarregado):
  // trocar de cenário sem mudar quais recursos aparecem não dispara nova
  // consulta.
  const recursoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const saida of [saidaAtual, saidaAjustada]) {
      if (!saida) continue;
      for (const id of saida.recursosQueDeterminamTermino) ids.add(id);
      for (const linha of saida.detalhamentoPorRecurso) ids.add(linha.recursoId);
    }
    return Array.from(ids).sort();
  }, [saidaAtual, saidaAjustada]);
  const chaveRecursoIds = recursoIds.join(",");

  const [nomesRecursosCarregado, setNomesRecursosCarregado] = useState<NomesDiagnostico["recursos"]>({});

  useEffect(() => {
    let cancelado = false;

    if (recursoIds.length === 0) {
      return () => {
        cancelado = true;
      };
    }

    // Falha de rede aqui nunca apaga a previsão já calculada
    // (saidaAtual/saidaAjustada são independentes) - carregarNomesDiagnostico
    // já devolve mapa vazio em erro; quem exibe cai no fallback (ID cru).
    carregarNomesDiagnostico(supabase, { recursoIds, bomOperacaoIds: [] }).then((nomes) => {
      if (!cancelado) {
        setNomesRecursosCarregado(nomes.recursos);
      }
    });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveRecursoIds]);

  const nomesRecursos = recursoIds.length === 0 ? {} : nomesRecursosCarregado;

  return { base, carregandoBase, erroBase, saidaAtual, saidaAjustada, nomesRecursos };
}
