// Motor de Avaliacao Sequencial de Capacidade - determinístico, porém
// não persistente: seu estado interno (capacidadeRemanescente) existe
// apenas durante esta chamada de função e jamais representa um estado
// oficial do sistema. Não confundir com uma tabela no futuro.
//
// A Simulação Comercial verifica cenários possíveis, sem assumir o
// papel do PCP. O orçamentista define o roteiro de referência; a
// empresa configura quais substituições são aceitáveis; a Simulação
// apenas avalia capacidade dentro desses limites, sem executar
// sequenciamento ou distribuição de produção.
//
// Fronteira: o Motor RECEBE "Capacidade Disponível Inicial" e
// "Comprometido" já prontos (ver prepararEntradasMotor.ts) - não
// recalcula calendário, produtividade nem comprometimento de outros
// projetos, só consome.
//
// Reprodutibilidade: função pura, síncrona, sem I/O. Usa apenas objetos
// simples (Record) percorridos na ordem em que as chaves foram
// inseridas (que por sua vez segue a ordem de operacoesOrdenadas,
// responsabilidade de quem monta as entradas). Nenhum Map/Set, nenhuma
// dependência de ordem de retorno de rede/banco.
//
// Entrega 2 (distribuição parcial): uma operação pode agora ser
// atendida por MAIS DE UM recurso - o original primeiro, depois os
// compatíveis na ordem cadastrada, cada um consumido por completo antes
// de passar ao próximo (regra de negócio fechada). O que sobrar vira
// déficit da operação, não mais um estado binário "coube tudo/não coube
// nada".
import { CandidatoDuplicadoError } from "./errors";
import { tratarComoZero } from "./constantesNumericas";

export type MotivoConsideracao = "ORIGINAL" | "COMPATIBILIDADE";

export interface OperacaoRoteiro {
  bomOperacaoId: string;
  recursoOriginalId: string;
  /** Tempo desta operação para UMA unidade, em minutos (bom_operacoes.tempo_estimado_minutos). */
  tempoEstimadoMinutos: number;
  /** Quantidade acumulada até esta operação (projeto_item.quantidade × bom_itens.quantidade em cada nível de subconjunto). */
  quantidade: number;
}

export interface CandidatoRecurso {
  recursoId: string;
  /** Ordem de prioridade cadastrada em recurso_produtivo_compatibilidades - menor primeiro. Sempre > 0 (recurso_produtivo_compatibilidades_prioridade_check). */
  prioridade: number;
}

/** Candidato já normalizado - origem explícita, sem depender de nenhum valor numérico sentinela para saber quem é o original. */
export interface CandidatoNormalizado {
  recursoId: string;
  origem: MotivoConsideracao;
  /** null para ORIGINAL; prioridade cadastrada (sempre > 0) para COMPATIBILIDADE. Só para persistência/auditoria - não participa da decisão de ordem (a ordem já vem pronta no array). */
  prioridade: number | null;
}

export interface EntradasMotor {
  /** Operações do roteiro, JÁ NA ORDEM em que devem ser processadas (decisão: sequência do roteiro de fabricação). */
  operacoesOrdenadas: OperacaoRoteiro[];
  /** Capacidade Disponível Inicial por recurso, em HORAS-PADRÃO-equivalentes - JÁ LÍQUIDA de comprometido (ver prepararEntradasMotor.ts, único lugar onde esse desconto acontece). O núcleo nunca subtrai comprometido de novo - por isso não recebe mais esse campo separado. */
  capacidadeDisponivelInicial: Record<string, number>;
  /** Compatibilidades diretas do recurso original, já ordenadas por prioridade ascendente. */
  compatibilidades: Record<string, CandidatoRecurso[]>;
}

/** Uma fatia da operação atendida por um único recurso. 0..N por operação - vazio significa déficit total. */
export interface DistribuicaoRecurso {
  recursoId: string;
  origem: MotivoConsideracao;
  /** 0 para ORIGINAL; prioridade cadastrada (sempre > 0) para COMPATIBILIDADE. Só para persistência/auditoria - não participou da decisão de ordem (já veio de normalizarCandidatos). */
  ordemConsideracao: number;
  /** Horas-padrão desta fatia especificamente - nunca a operação inteira. */
  horasPadraoAlocadas: number;
  /** Saldo do recurso ANTES desta alocação, em horas-padrão-equivalentes (capacidade efetiva remanescente). */
  capacidadeDisponivelAntes: number;
  /** = capacidadeDisponivelAntes - horasPadraoAlocadas, nunca negativo. */
  capacidadeDisponivelDepois: number;
}

export interface ItemResultadoMotor {
  bomOperacaoId: string;
  recursoOriginalId: string;
  tempoNecessarioHoras: number;
  /** 0..N alocações, na ordem em que o núcleo as decidiu (original primeiro, depois compatíveis por prioridade). */
  distribuicoes: DistribuicaoRecurso[];
  /** tempoNecessarioHoras - soma(distribuicoes.horasPadraoAlocadas). Sempre >= 0. */
  deficit: number;
}

/**
 * Constrói a lista de candidatos já na ordem final de avaliação - o
 * original SEMPRE primeiro, por construção explícita (nunca por um
 * valor numérico "vencer" uma comparação, tipo um sentinela -1), depois
 * os compatíveis ordenados pela prioridade cadastrada.
 *
 * Falha explicitamente (CandidatoDuplicadoError) se o recurso original
 * aparecer também entre os compatíveis, ou se um compatível se repetir -
 * o schema hoje já impede isso estruturalmente (CHECK origem<>destino,
 * unique parcial em (origem,destino) entre ativos), mas o núcleo não
 * confia só nisso: duplicidade aqui é corrupção de cadastro ou de
 * montagem de entradas, não um caso de negócio a ser tolerado em
 * silêncio.
 */
export function normalizarCandidatos(
  recursoOriginalId: string,
  compatibilidades: CandidatoRecurso[],
): CandidatoNormalizado[] {
  const vistos = new Set<string>([recursoOriginalId]);

  for (const candidato of compatibilidades) {
    if (vistos.has(candidato.recursoId)) {
      throw new CandidatoDuplicadoError(recursoOriginalId, candidato.recursoId);
    }
    vistos.add(candidato.recursoId);
  }

  // Reordena explicitamente aqui - mesma defesa que já existia no
  // núcleo antes da Entrega 2: não confia que quem montou
  // `compatibilidades` já entregou o array na ordem certa.
  const compatibilidadesOrdenadas = [...compatibilidades].sort(
    (a, b) => a.prioridade - b.prioridade,
  );

  return [
    { recursoId: recursoOriginalId, origem: "ORIGINAL" as const, prioridade: null },
    ...compatibilidadesOrdenadas.map((candidato) => ({
      recursoId: candidato.recursoId,
      origem: "COMPATIBILIDADE" as const,
      prioridade: candidato.prioridade,
    })),
  ];
}

export function executarMotorAvaliacaoSequencial(
  entradas: EntradasMotor,
): ItemResultadoMotor[] {
  // Estado interno - existe só durante esta chamada, nunca persistido.
  const capacidadeRemanescente: Record<string, number> = {};

  for (const recursoId of Object.keys(entradas.capacidadeDisponivelInicial)) {
    const bruto = entradas.capacidadeDisponivelInicial[recursoId];
    // Nunca negativo, e resíduo de ponto flutuante próximo de zero vira
    // zero - sem isso, um saldo como -0.00000000000001 poderia deixar
    // um recurso indevidamente "disponível" ou gerar déficit artificial
    // em outra ponta. Já líquido de comprometido - ver comentário do
    // campo em EntradasMotor.
    capacidadeRemanescente[recursoId] = tratarComoZero(bruto) ? 0 : Math.max(0, bruto);
  }

  const resultado: ItemResultadoMotor[] = [];

  for (const operacao of entradas.operacoesOrdenadas) {
    const tempoNecessarioHoras =
      (operacao.tempoEstimadoMinutos / 60) * operacao.quantidade;

    const candidatos = normalizarCandidatos(
      operacao.recursoOriginalId,
      entradas.compatibilidades[operacao.recursoOriginalId] ?? [],
    );

    const distribuicoes: DistribuicaoRecurso[] = [];
    let restante = tempoNecessarioHoras;

    for (const candidato of candidatos) {
      if (tratarComoZero(restante)) {
        restante = 0;
        break;
      }

      if (capacidadeRemanescente[candidato.recursoId] === undefined) {
        capacidadeRemanescente[candidato.recursoId] = 0;
      }

      const disponivelBruto = capacidadeRemanescente[candidato.recursoId];
      const disponivel = tratarComoZero(disponivelBruto) ? 0 : disponivelBruto;
      if (disponivel <= 0) continue;

      // Consome o candidato atual até o limite do que ele tem - nunca
      // passa ao próximo antes de esgotar (ou zerar) o candidato atual.
      const alocado = Math.min(disponivel, restante);
      const saldoDepois = Math.max(0, disponivel - alocado);

      distribuicoes.push({
        recursoId: candidato.recursoId,
        origem: candidato.origem,
        ordemConsideracao: candidato.origem === "ORIGINAL" ? 0 : (candidato.prioridade as number),
        horasPadraoAlocadas: alocado,
        capacidadeDisponivelAntes: disponivel,
        capacidadeDisponivelDepois: saldoDepois,
      });

      capacidadeRemanescente[candidato.recursoId] = saldoDepois;
      restante = tratarComoZero(restante - alocado) ? 0 : restante - alocado;
    }

    resultado.push({
      bomOperacaoId: operacao.bomOperacaoId,
      recursoOriginalId: operacao.recursoOriginalId,
      tempoNecessarioHoras,
      distribuicoes,
      deficit: Math.max(0, restante),
    });

    // Sem alternativa viável (ou capacidade insuficiente para cobrir o
    // total): registra déficit para ESTA operação e continua para a
    // próxima - o Motor não para no primeiro déficit.
  }

  return resultado;
}
