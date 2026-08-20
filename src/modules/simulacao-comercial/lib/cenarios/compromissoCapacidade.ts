// DEC-007 - Gerador de Cenários, redesenho "previsão comercial por
// capacidade" (substitui a análise operação-por-operação como cálculo
// principal - ver knowledge/arquitetura-tecnica/DEC-007_Gerador_Comparador_Cenarios_Viaveis.md).
//
// Contrato único e neutro de origem: o núcleo (seleção de fonte,
// agregação, fila FIFO - nas próximas etapas) só conhece
// CompromissoGranular/CompromissoCapacidade, nunca tabelas específicas
// (simulacao_comercial_itens, ordens_fabricacao, ou o futuro PCP). Cada
// origem de dado tem seu próprio carregador (fora deste arquivo) que
// traduz para este contrato.
//
// "classeFila" (não uma data fabricada) é quem decide se um compromisso
// é "confirmado" (já ocupa capacidade real, precisa de dataEntradaFila
// verdadeira) ou "orcamento_novo" (o orçamento em avaliação, nunca teve
// uma data comercial de entrada - fica sempre depois dos confirmados,
// por classeFila, nunca por uma data ou prioridade inventada).

export type ClasseFila = "confirmado" | "orcamento_novo";

export type OrigemCompromisso = "snapshot_comercial" | "pcp_real" | "orcamento_novo";

/** "misto" só existe no agregado (CompromissoCapacidade), quando granulares de origens diferentes caem no mesmo bloco de agregação. */
export type OrigemCompromissoAgregado = OrigemCompromisso | "misto";

/**
 * Unidade granular - a chave de deduplicação REAL entre snapshot e PCP
 * (nunca (projetoId,recursoId) sozinho - ver selecionarFonteVencedora.ts).
 * Nunca exibida diretamente na tela nem usada na fila FIFO - só como
 * entrada para seleção de fonte + agregação.
 */
export interface CompromissoGranular {
  readonly empresaId: string;
  readonly projetoId: string;
  /**
   * null quando a fonte não distingue item - hoje é sempre null para
   * origem="snapshot_comercial" (simulacao_comercial_itens não grava
   * projeto_item_id). Preenchido para "pcp_real" (quando existir) e
   * "orcamento_novo" (roteiro vivo, sempre tem projetoItemId).
   */
  readonly projetoItemId: string | null;
  /**
   * Identidade estável do trabalho, tão granular quanto a fonte
   * permitir. Para origem="snapshot_comercial" hoje, é o próprio
   * agregado "(projetoId)::(recursoId)" - o snapshot não tem chave mais
   * fina (ver DiagnosticoGranularidadeInsuficiente).
   */
  readonly chaveTrabalho: string;
  readonly recursoId: string;
  readonly horasRestantesPadrao: number;
  /** Data a partir da qual este compromisso pode consumir capacidade (ex.: janela_inicio da simulação vigente, para snapshot_comercial). */
  readonly disponivelAPartirDe: string;
  /**
   * Data real de entrada na fila comercial (ex.: transição para
   * pedido_recebido). Obrigatória quando classeFila="confirmado" -
   * nunca fabricada (aprovado_em, hoje, início da grade). null só é
   * válido quando classeFila="orcamento_novo".
   */
  readonly dataEntradaFila: string | null;
  /** Constante hoje (sem campo de prioridade comercial real no schema). */
  readonly prioridade: number;
  readonly classeFila: ClasseFila;
  readonly origem: OrigemCompromisso;
}

/**
 * Declaração explícita do adaptador PCP (futuro) de que ele cobre
 * INTEGRALMENTE a carga de um (empresaId,projetoId,recursoId) - nunca
 * deduzida por selecionarFonteVencedora só por existir alguma linha de
 * PCP. Tipo próprio, puro, para o adaptador PCP declarar isso
 * separadamente da lista de CompromissoGranular.
 */
export interface CoberturaIntegralPcp {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly recursoId: string;
}

/**
 * Reportado quando PCP cobre só PARTE da carga de um
 * (empresaId,projetoId,recursoId) cujo snapshot é agregado (sem chave
 * granular) e não há CoberturaIntegralPcp declarada para aquele trio -
 * impossível deduplicar com segurança. Nunca soma as duas fontes, nunca
 * descarta o snapshot às cegas - o trio inteiro fica de fora da
 * agregação numérica, só aparece aqui como diagnóstico.
 */
export interface DiagnosticoGranularidadeInsuficiente {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly recursoId: string;
  readonly motivo: string;
}

export interface ResultadoSelecaoFonte {
  readonly vencedores: readonly CompromissoGranular[];
  readonly diagnosticos: readonly DiagnosticoGranularidadeInsuficiente[];
}

/**
 * Unidade agregada - o que a fila FIFO (próxima etapa) e a interface
 * consomem. Chave de agregação segura (empresaId,projetoId,recursoId,
 * classeFila,prioridade,dataEntradaFila,disponivelAPartirDe) - NUNCA só
 * (empresaId,projetoId,recursoId): dois blocos do mesmo projeto/recurso
 * com disponibilidade diferente (ex.: parte já disponível, parte só
 * disponível no futuro via PCP granular) permanecem SEPARADOS - somar
 * anteciparia horas que ainda não podem entrar na fila.
 */
export interface CompromissoCapacidade {
  readonly empresaId: string;
  readonly projetoId: string;
  readonly recursoId: string;
  /** Soma de horasRestantesPadrao dos granulares vencedores deste bloco - aditivo, sem ambiguidade de unidade (produtividade não entra aqui, é resolvida por recurso na etapa de consumo). */
  readonly horasRestantesPadrao: number;
  readonly disponivelAPartirDe: string;
  readonly dataEntradaFila: string | null;
  readonly prioridade: number;
  readonly classeFila: ClasseFila;
  /**
   * Determinística, independente da ordem do array - distingue
   * segmentos do mesmo projeto/recurso com disponibilidade diferente.
   * É literalmente a chave de agregação serializada - nunca um segundo
   * conceito de identidade.
   */
  readonly chaveOrdenacao: string;
  readonly origem: OrigemCompromissoAgregado;
  /** Só para auditoria/"Ver detalhes" - nunca usada para ordenar nem para decidir agregação. */
  readonly chavesTrabalhoOrigem: readonly string[];
}
