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
  /** Ordem de prioridade cadastrada em recurso_produtivo_compatibilidades - menor primeiro. */
  prioridade: number;
}

export interface EntradasMotor {
  /** Operações do roteiro, JÁ NA ORDEM em que devem ser processadas (decisão: sequência do roteiro de fabricação). */
  operacoesOrdenadas: OperacaoRoteiro[];
  /** Capacidade Disponível Inicial por recurso, em HORAS - resultado pronto de Calendário → Dias Produtivos → Capacidade Diária → Produtividade → Horas Adicionais. */
  capacidadeDisponivelInicial: Record<string, number>;
  /** Comprometido por outros projetos aprovados, por recurso, em HORAS (calcular_comprometido_v1). */
  comprometido: Record<string, number>;
  /** Compatibilidades diretas do recurso original, já ordenadas por prioridade ascendente. */
  compatibilidades: Record<string, CandidatoRecurso[]>;
}

export interface ItemResultadoMotor {
  bomOperacaoId: string;
  recursoOriginalId: string;
  /** null quando nenhum recurso (original nem compatível) comportou a operação inteira. */
  recursoConsideradoId: string | null;
  motivoConsideracao: MotivoConsideracao | null;
  deficit: boolean;
  tempoNecessarioHoras: number;
}

export function executarMotorAvaliacaoSequencial(
  entradas: EntradasMotor,
): ItemResultadoMotor[] {
  // Estado interno - existe só durante esta chamada, nunca persistido.
  const capacidadeRemanescente: Record<string, number> = {};

  for (const recursoId of Object.keys(entradas.capacidadeDisponivelInicial)) {
    capacidadeRemanescente[recursoId] =
      entradas.capacidadeDisponivelInicial[recursoId] -
      (entradas.comprometido[recursoId] ?? 0);
  }

  const resultado: ItemResultadoMotor[] = [];

  for (const operacao of entradas.operacoesOrdenadas) {
    const tempoNecessarioHoras =
      (operacao.tempoEstimadoMinutos / 60) * operacao.quantidade;

    // Operação indivisível: avaliada inteira em um único recurso - o
    // Motor nunca divide a mesma operação entre múltiplos recursos.
    //
    // Ordena por prioridade explicitamente aqui, em vez de confiar que
    // quem montou `entradas.compatibilidades` já entregou o array na
    // ordem certa - reprodutibilidade não pode depender de uma
    // convenção implícita de outra camada. Recurso original usa -1
    // como chave de ordenação (sempre primeira opção, decisão 5a),
    // menor que qualquer prioridade cadastrada (que é sempre > 0).
    const candidatos = [
      { recursoId: operacao.recursoOriginalId, prioridade: -1 },
      ...(entradas.compatibilidades[operacao.recursoOriginalId] ?? []),
    ].sort((a, b) => a.prioridade - b.prioridade);

    let recursoConsideradoId: string | null = null;

    for (const candidato of candidatos) {
      if (capacidadeRemanescente[candidato.recursoId] === undefined) {
        capacidadeRemanescente[candidato.recursoId] = 0;
      }

      // Primeiro candidato que comporta a operação INTEIRA vence - não
      // o mais livre, não o de maior prioridade "melhor", apenas o
      // primeiro na ordem (original, depois compatíveis por prioridade).
      if (capacidadeRemanescente[candidato.recursoId] >= tempoNecessarioHoras) {
        recursoConsideradoId = candidato.recursoId;
        capacidadeRemanescente[candidato.recursoId] -= tempoNecessarioHoras;
        break;
      }
    }

    resultado.push({
      bomOperacaoId: operacao.bomOperacaoId,
      recursoOriginalId: operacao.recursoOriginalId,
      recursoConsideradoId,
      motivoConsideracao:
        recursoConsideradoId === null
          ? null
          : recursoConsideradoId === operacao.recursoOriginalId
            ? "ORIGINAL"
            : "COMPATIBILIDADE",
      deficit: recursoConsideradoId === null,
      tempoNecessarioHoras,
    });

    // Sem alternativa viável: registra déficit para ESTA operação e
    // continua para a próxima - o Motor não para no primeiro déficit.
  }

  return resultado;
}
