// AMBIENTE DE DEMONSTRAÇÃO — PCP-Etapa B (reformulação visual), protótipo
// mockado. Nenhum dado aqui corresponde a projetos, clientes, OFs, OPs,
// requisições de compra ou observações reais do NEXOTFE — numeração e
// nomes são deliberadamente fictícios e distintos do padrão real (26xxxx)
// para nunca serem confundidos com produção. Nenhum destes objetos é lido
// nem gravado pelo Supabase.

// Confiabilidade da PREVISÃO OPERACIONAL calculada pelo PCP - nunca da
// entrega comprometida pelo Comercial (essa é fixa, ver dataEntregaComprometida).
// "integral": todas as OFs necessárias liberadas e sem lacuna de cobertura.
// "parcial": existem OFs ainda não liberadas - Motor programa só o elegível,
// sem previsão integral confiável.
// "indisponivel": sem nenhuma OF liberada, ou liberação completa mas com
// lacuna de cobertura (ex.: operação sem recurso produtivo) - liberar todas
// as OFs é condição necessária, mas não suficiente, para uma previsão integral.
export type ConfiabilidadePrevisao = "integral" | "parcial" | "indisponivel";
export type SituacaoPrazo = "adiantado" | "no_prazo" | "atrasado" | "indeterminado";

export interface EventoHistoricoMock {
  data: string;
  evento: string;
}

// Situação real do material dentro da Requisição de Compra - nunca
// inventa data quando não houver prazo confiável (regra 5/6 do pedido).
export type SituacaoMaterialCompra = "em_orcamento" | "pedido_emitido" | "recebido" | "recebido_parcial";

export interface MaterialRequisicaoMock {
  descricao: string;
  situacao: SituacaoMaterialCompra;
  // Só preenchido quando existir Pedido de Compra com prazo informado
  // pelo setor Compras (regra 4) - nunca inferido.
  dataPrevista?: string | null;
  // Só preenchido quando houver recebimento (total ou parcial) (regra 7).
  dataRecebimento?: string | null;
  // Nuance opcional para diferenciar recebido de disponível/liberado
  // para fabricação (regra 8) - texto livre, mock.
  detalheQuantidade?: string;
}

export interface RequisicaoCompraMock {
  numero: string;
  materiais: MaterialRequisicaoMock[];
}

export interface ObservacaoPcpMock {
  id: string;
  data: string;
  hora: string;
  responsavel: string;
  texto: string;
}

// Situação de liberação da própria OF - análise industrial PRÉVIA, OF a
// OF, que decide se ela está apta a entrar em fabricação. Única fonte de
// verdade sobre liberação (ver calcularCoberturaOfs) - nunca duplicar em
// um contador próprio, que ficaria desalinhado a cada liberação de OF.
export type SituacaoLiberacaoOf = "apta" | "bloqueada" | "liberada";

export interface LiberacaoOfMock {
  responsavel: string;
  data: string;
  hora: string;
}

// Momento Y - origem do fornecimento e natureza comercial do projeto.
// Mesmos conceitos já validados em /design/pcp-momento-y-preview, agora
// incorporados à Cópia Operacional da OF (nunca uma tela separada).
export type OrigemFornecimento = "empresa" | "cliente";
export type NaturezaComercial = "fabricacao" | "desenvolvimento" | "industrializacao" | "servico";

export const LABEL_NATUREZA_COMERCIAL: Record<NaturezaComercial, string> = {
  fabricacao: "Fabricação",
  desenvolvimento: "Desenvolvimento",
  industrializacao: "Industrialização",
  servico: "Serviço",
};

export const DESCRICAO_NATUREZA_COMERCIAL: Record<NaturezaComercial, string> = {
  fabricacao: "Fabricação — matéria-prima normalmente fornecida pela empresa.",
  desenvolvimento: "Desenvolvimento — projeto novo, sem histórico de fornecimento ainda.",
  industrializacao:
    "Industrialização — é comum que o cliente forneça material para esta natureza, mas isso nunca é decidido automaticamente: cada item do PCP precisa de origem confirmada.",
  servico: "Serviço — natureza tipicamente sem consumo de matéria-prima própria.",
};

// Natureza da Operação (decisão registrada em docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md,
// seção "Natureza Comercial x Natureza Operacional da OF", 2026-10-30):
// dentro da OF só existem 3 classificações operacionais - Desenvolvimento
// é natureza COMERCIAL, nunca aparece como quarta opção aqui, sempre
// mapeado para Fabricação. Nunca usar "Venda" nem "Venda/Fabricação" como
// rótulo - só "Fabricação". A natureza comercial original (LABEL_NATUREZA_COMERCIAL,
// acima) nunca é reescrita por este mapeamento - os dois coexistem lado a
// lado na tela, cada um com seu próprio rótulo.
export const LABEL_NATUREZA_OPERACAO: Record<NaturezaComercial, string> = {
  fabricacao: "Fabricação",
  desenvolvimento: "Fabricação",
  industrializacao: "Industrialização",
  servico: "Serviço",
};

// Material disponível no cadastro para as ações "Adicionar" e "Substituir"
// dentro da conferência de matéria-prima do PCP - simula a busca no
// cadastro real de matérias-primas.
// Campos espelham o cadastro real de materias_primas (codigo, descricao,
// material_especificacao, bitola/dimensao) - código entra na busca junto
// com descrição/especificação/forma, mesmo conjunto de campos que a busca
// real usa (MateriaPrimaSearchInput/buscarMateriasPrimas).
export interface MaterialCatalogoMock {
  materiaPrimaId: string;
  codigo: string;
  descricao: string;
  materialEspecificacao: string;
  formaDimensoes: string;
  unidade: string;
}

// Catálogo genérico de fallback - usado por qualquer OF que não tenha o
// próprio catalogoMateriaPrima (ver OrdemFabricacaoMock). Garante que
// "Adicionar material"/"Substituir" fiquem disponíveis em toda OF, não só
// nas poucas equipadas com catálogo dedicado para os cenários de
// demonstração.
export const CATALOGO_GENERICO_MATERIA_PRIMA: MaterialCatalogoMock[] = [
  {
    materiaPrimaId: "mp-generico-arruela-m8",
    codigo: "MP-10410",
    descricao: "Arruela de pressão",
    materialEspecificacao: "Aço inox A2",
    formaDimensoes: "M8",
    unidade: "un",
  },
  {
    materiaPrimaId: "mp-generico-parafuso-m8",
    codigo: "MP-10233",
    descricao: "Parafusos de fixação",
    materialEspecificacao: "Aço inox A2",
    formaDimensoes: "Allen M8x25",
    unidade: "un",
  },
  {
    materiaPrimaId: "mp-generico-chapa-a36",
    codigo: "MP-20507",
    descricao: "Chapa genérica",
    materialEspecificacao: "Aço ASTM A36",
    formaDimensoes: "Chapa 6,35 mm",
    unidade: "kg",
  },
  {
    materiaPrimaId: "mp-generico-barra-1045",
    codigo: "MP-20118",
    descricao: "Barra genérica",
    materialEspecificacao: "Aço SAE 1045",
    formaDimensoes: "Barra redonda Ø 25 mm",
    unidade: "kg",
  },
];

// Matéria-prima específica de UMA OF.
export interface MateriaPrimaOfMock {
  id: string;
  descricao: string;
  materialEspecificacao: string;
  formaDimensoes: string;
  quantidadeNecessaria: string;
  // Ajuste pontual do PCP para esta OF - nunca sobrescreve os campos acima,
  // que permanecem como referência original (regra 3 do pedido).
  ajusteOperacional?: string;
  // Momento Y (todos opcionais, retrocompatíveis - nenhum item existente
  // precisou ser reescrito). Quando ausentes, a cópia operacional deriva
  // quantidade/unidade de quantidadeNecessaria e assume origemFornecimento
  // 'empresa' (mesmo default usado por confirmar_necessidades_momento_y
  // quando o campo vem ausente - nunca uma reclassificação automática para
  // 'cliente'). Uma vez salvos pelo PCP, esses campos passam a refletir a
  // decisão explícita dele, não mais um valor derivado.
  materiaPrimaId?: string;
  quantidadeConfirmada?: number;
  unidade?: string;
  origemFornecimento?: OrigemFornecimento;
  quantidadeCi?: number;
}

// Histórico de revisão do tempo Y (PCP) de uma operação - nunca sobrescreve
// entradas anteriores; X permanece imutável em qualquer revisão.
export interface RevisaoOperacaoMock {
  id: string;
  data: string;
  hora: string;
  responsavel: string;
  tempoAnterior: number;
  tempoNovo: number;
  justificativa: string;
}

// Histórico de revisão da observação operacional (Y) de uma operação -
// mesmo padrão de RevisaoOperacaoMock, mas para texto; nunca sobrescreve
// entradas anteriores. A observação original do roteiro (X,
// observacaoRoteiro) permanece imutável em qualquer revisão. Reaproveita a
// mesma justificativa única exigida no "Salvar alterações" da OF - não
// existe um segundo campo de justificativa específico de observação.
export interface RevisaoObservacaoOperacaoMock {
  id: string;
  data: string;
  hora: string;
  responsavel: string;
  textoAnterior: string | null;
  textoNovo: string | null;
  justificativa: string;
}

export interface OperacaoProducaoMock {
  id: string;
  sequencia: number;
  descricao: string;
  recurso: string;
  // Sequências de outras operações da mesma OF das quais esta depende -
  // nunca presumir cadeia linear simples (regra explícita do pedido).
  dependeDe: number[];
  ferramentaEspecial?: string;
  tratamento?: string;
  terceirizada: boolean;
  // X — Comercial: referência do orçamento, nunca sobrescrita pelo PCP.
  tempoXComercial: number;
  // Y — PCP: tempo revisado pelo PCP; pode diferir de X, com justificativa.
  tempoYPcp: number;
  // Z — Realizado: apontamento real; null = operação ainda não iniciada
  // (nunca renderizar como zero). Nunca calcular saldo subtraindo Z de Y
  // aqui - saldo restante estimado é conceito próprio (DEC-P8-02).
  tempoZRealizado: number | null;
  horasMaquina?: number;
  horasColaborador?: number;
  condicaoLiberacao: string;
  // Operação sem recurso produtivo associado - excluída do cálculo oficial
  // do Motor. Mesmo com a OF liberada, isso impede previsão integral
  // (ver calcularPrevisaoOperacional) - "liberar tudo" não é suficiente.
  semRecursoProdutivo?: boolean;
  revisoes: RevisaoOperacaoMock[];
  // X — Observação original do roteiro (campo real bom_operacoes.observacoes,
  // ver 202607060001_bom_operacoes_servicos_transportes.sql) - nunca editável
  // pelo PCP, nunca sobrescrita por revisão alguma.
  observacaoRoteiro?: string | null;
  // Y — Observação operacional desta OF, mantida/corrigida/complementada
  // pelo PCP. null/ausente = nenhuma revisão salva - usar observacaoRoteiro.
  observacaoPcp?: string | null;
  revisoesObservacao: RevisaoObservacaoOperacaoMock[];
}

export interface OrdemFabricacaoMock {
  id: string;
  numero: string;
  codigoPeca: string;
  descricaoPeca: string;
  quantidade: number;
  situacaoLiberacao: SituacaoLiberacaoOf;
  liberacao?: LiberacaoOfMock | null;
  desenhoTecnico: string;
  materiaPrima: MateriaPrimaOfMock[];
  // Momento Y - catálogo disponível para "Adicionar"/"Substituir" material
  // nesta OF. Opcional: OFs sem catálogo simplesmente não mostram essas
  // ações (nenhum botão quebrado).
  catalogoMateriaPrima?: MaterialCatalogoMock[];
  // Indicador "OF revisada" (docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md) -
  // preenchido só por um salvamento válido da cópia operacional Y (nunca
  // um checkbox manual). Ausente/null = "Aguardando revisão".
  revisaoSalvaEm?: string | null;
  ferramentaEspecial?: string;
  servicoExterno?: string;
  pendencias: string[];
  operacoes: OperacaoProducaoMock[];
}

export interface ProjetoAguardandoMock {
  id: string;
  numeroProjeto: string;
  nomeCliente: string;
  documentoCliente: string;
  // Momento Y - mesmo conceito de natureza comercial do projeto real
  // (projetos.tipo_projeto); somente leitura na Cópia Operacional da OF.
  naturezaComercial: NaturezaComercial;
  dataEntradaPcp: string;
  dataEntregaComprometida: string;
  pendencias: string[];
  ordensFabricacao: OrdemFabricacaoMock[];
}

export interface ProjetoLiberadoMock {
  id: string;
  numeroProjeto: string;
  nomeCliente: string;
  documentoCliente: string;
  naturezaComercial: NaturezaComercial;
  // Data prometida pelo Comercial - FIXA, nunca editável/sobrescrita pelo
  // PCP em nenhuma tela ou ação deste protótipo (regra inviolável do pedido).
  dataEntregaComprometida: string;
  prioridade: number;
  // Resultado hipotético do Motor PCP SE houvesse cobertura integral e sem
  // lacunas - nunca exibir diretamente; sempre passar por
  // calcularPrevisaoOperacional(), que decide se essa data pode de fato ser
  // apresentada como previsão (ver regras 3/9 do pedido).
  dataConclusaoPrevista: string | null;
  // Pendências ligadas às próprias OFs/operações (seção "OFs e operações").
  pendenciasOperacionais: string[];
  // Outras pendências industriais e serviços externos, distintas das
  // pendências de OF (seção própria no Resumo do Projeto).
  pendenciasExternas: string[];
  requisicoesCompra: RequisicaoCompraMock[];
  observacoesPcp: ObservacaoPcpMock[];
  ordensFabricacao: OrdemFabricacaoMock[];
  historico: EventoHistoricoMock[];
}

// --- Derivação de previsão/status - sempre ao vivo a partir de
// ordensFabricacao, nunca de um campo estático (a liberação de OF é
// interativa no protótipo, então o valor estático ficaria desatualizado).

export interface CoberturaOfsMock {
  total: number;
  liberadas: number;
  aptas: number;
  bloqueadas: number;
  pendentes: number;
}

export function calcularCoberturaOfs(ordens: OrdemFabricacaoMock[]): CoberturaOfsMock {
  const total = ordens.length;
  const liberadas = ordens.filter((of) => of.situacaoLiberacao === "liberada").length;
  const aptas = ordens.filter((of) => of.situacaoLiberacao === "apta").length;
  const bloqueadas = ordens.filter((of) => of.situacaoLiberacao === "bloqueada").length;
  return { total, liberadas, aptas, bloqueadas, pendentes: total - liberadas };
}

export interface PrevisaoOperacionalMock {
  confiabilidade: ConfiabilidadePrevisao;
  dataConclusaoPrevista: string | null;
  motivo?: string;
}

// Regra 9 do pedido: liberar todas as OFs é condição NECESSÁRIA, mas não
// SUFICIENTE - só retorna "integral" quando, além disso, nenhuma operação
// das OFs liberadas estiver sem recurso produtivo e houver um resultado do
// Motor para apresentar.
export function calcularPrevisaoOperacional(
  ordensFabricacao: OrdemFabricacaoMock[],
  dataConclusaoPrevistaIntegral: string | null,
): PrevisaoOperacionalMock {
  const cobertura = calcularCoberturaOfs(ordensFabricacao);

  if (cobertura.total === 0 || cobertura.liberadas === 0) {
    return { confiabilidade: "indisponivel", dataConclusaoPrevista: null, motivo: "Nenhuma OF liberada ainda" };
  }

  if (cobertura.liberadas < cobertura.total) {
    return { confiabilidade: "parcial", dataConclusaoPrevista: null };
  }

  const operacoesSemRecurso = ordensFabricacao.flatMap((of) => of.operacoes).filter((op) => op.semRecursoProdutivo);
  if (operacoesSemRecurso.length > 0) {
    return {
      confiabilidade: "indisponivel",
      dataConclusaoPrevista: null,
      motivo: `${operacoesSemRecurso.length} operação(ões) sem recurso produtivo associado, excluída(s) do cálculo oficial`,
    };
  }

  if (!dataConclusaoPrevistaIntegral) {
    return {
      confiabilidade: "indisponivel",
      dataConclusaoPrevista: null,
      motivo: "Motor ainda não calculou uma previsão para este projeto",
    };
  }

  return { confiabilidade: "integral", dataConclusaoPrevista: dataConclusaoPrevistaIntegral };
}

export function calcularDiferencaDias(dataA: string, dataB: string): number {
  return Math.round((new Date(`${dataA}T00:00:00`).getTime() - new Date(`${dataB}T00:00:00`).getTime()) / 86400000);
}

// Só compara com a entrega comprometida quando houver previsão INTEGRAL -
// ausência de previsão integral nunca é tratada como "no prazo" (regra 10).
export function calcularSituacaoPrazo(previsao: PrevisaoOperacionalMock, dataEntregaComprometida: string): SituacaoPrazo {
  if (previsao.confiabilidade !== "integral" || !previsao.dataConclusaoPrevista) return "indeterminado";
  const diferenca = calcularDiferencaDias(previsao.dataConclusaoPrevista, dataEntregaComprometida);
  if (diferenca < 0) return "adiantado";
  if (diferenca === 0) return "no_prazo";
  return "atrasado";
}

export const PROJETOS_AGUARDANDO_MOCK: ProjetoAguardandoMock[] = [
  {
    id: "aguardando-1",
    numeroProjeto: "DEMO-3001",
    nomeCliente: "Metalúrgica Vale do Aço",
    documentoCliente: "OC-88213",
    naturezaComercial: "fabricacao",
    dataEntradaPcp: "2026-10-20",
    dataEntregaComprometida: "2026-12-05",
    pendencias: ["Aguardando confirmação de desenho técnico pela Engenharia"],
    ordensFabricacao: [
      {
        id: "of-3001-1",
        numero: "OF-001",
        codigoPeca: "PC-77001",
        descricaoPeca: "Suporte lateral",
        quantidade: 4,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado (Rev. 3)",
        materiaPrima: [
          {
            id: "mp-3001-1-1",
            descricao: "Aço SAE 1020 — Barra redonda Ø 40 mm",
            materialEspecificacao: "Aço SAE 1020",
            formaDimensoes: "Barra redonda Ø 40 mm",
            quantidadeNecessaria: "4 un (1 barra por peça)",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-3001-1-10",
            sequencia: 10,
            descricao: "Serra",
            recurso: "Serra",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.4,
            tempoYPcp: 0.4,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-3001-1-20",
            sequencia: 20,
            descricao: "Furação",
            recurso: "Furadeira CNC",
            dependeDe: [10],
            terceirizada: false,
            tempoXComercial: 0.6,
            tempoYPcp: 0.6,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 10 (Serra) concluída",
            revisoes: [],
            observacaoRoteiro: "Furar com guia - evitar desvio de concentricidade no furo passante.",
            revisoesObservacao: [],
          },
          {
            id: "op-3001-1-30",
            sequencia: 30,
            descricao: "Inspeção",
            recurso: "Qualidade",
            dependeDe: [20],
            terceirizada: false,
            tempoXComercial: 0.2,
            tempoYPcp: 0.2,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 20 (Furação) concluída",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-3001-2",
        numero: "OF-002",
        codigoPeca: "PC-77002",
        descricaoPeca: "Bucha guia",
        quantidade: 6,
        situacaoLiberacao: "bloqueada",
        desenhoTecnico: "Aprovado (Rev. 1)",
        materiaPrima: [
          {
            id: "mp-3001-2-1",
            descricao: "Aço SAE 1045 — Barra redonda Ø 30 mm",
            materialEspecificacao: "Aço SAE 1045",
            formaDimensoes: "Barra redonda Ø 30 mm",
            quantidadeNecessaria: "6 un",
          },
        ],
        pendencias: ["Aguardando matéria-prima (Aço SAE 1045)"],
        operacoes: [
          {
            id: "op-3001-2-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.0,
            tempoYPcp: 1.0,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende do recebimento da matéria-prima",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-3001-3",
        numero: "OF-003",
        codigoPeca: "PC-77003",
        descricaoPeca: "Came de acionamento",
        quantidade: 1,
        situacaoLiberacao: "bloqueada",
        desenhoTecnico: "Aprovado (Rev. 2)",
        materiaPrima: [
          {
            id: "mp-3001-3-1",
            descricao: "Aço SAE 4340 — Tarugo Ø 60 mm",
            materialEspecificacao: "Aço SAE 4340",
            formaDimensoes: "Tarugo Ø 60 mm",
            quantidadeNecessaria: "1 un",
          },
        ],
        ferramentaEspecial: "Gabarito de fresamento especial (sob encomenda)",
        pendencias: ["Aguardando fabricação do gabarito especial"],
        operacoes: [
          {
            id: "op-3001-3-10",
            sequencia: 10,
            descricao: "Fresamento",
            recurso: "Centro de usinagem CNC",
            dependeDe: [],
            ferramentaEspecial: "Gabarito de fresamento especial",
            terceirizada: false,
            tempoXComercial: 1.2,
            tempoYPcp: 1.2,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da entrega do gabarito especial",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-3001-4",
        numero: "OF-004",
        codigoPeca: "PC-77004",
        descricaoPeca: "Eixo pinhão",
        quantidade: 2,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado (Rev. 2)",
        materiaPrima: [
          {
            id: "mp-3001-4-1",
            descricao: "Aço SAE 8620 — Barra redonda Ø 35 mm",
            materialEspecificacao: "Aço SAE 8620",
            formaDimensoes: "Barra redonda Ø 35 mm",
            quantidadeNecessaria: "2 un",
          },
          {
            id: "mp-3001-4-2",
            descricao: "Parafuso Allen M6x20 — Aço inox A2",
            materialEspecificacao: "Aço inox A2",
            formaDimensoes: "Allen M6x20",
            quantidadeNecessaria: "8 un",
          },
        ],
        catalogoMateriaPrima: [
          {
            materiaPrimaId: "mp-3001-4-arruela",
            codigo: "MP-10410",
            descricao: "Arruela de pressão",
            materialEspecificacao: "Aço inox A2",
            formaDimensoes: "M6",
            unidade: "un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-3001-4-10",
            sequencia: 10,
            descricao: "Serra",
            recurso: "Serra",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.5,
            tempoYPcp: 0.6,
            tempoZRealizado: 0.5,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [
              {
                id: "rev-op-3001-4-10-seed",
                data: "2026-10-21",
                hora: "08:40",
                responsavel: "Marcos (PCP)",
                tempoAnterior: 0.5,
                tempoNovo: 0.6,
                justificativa: "Ajuste de preparação de serra para lote maior que o usual",
              },
            ],
            observacaoRoteiro: "Cortar com sobremetal de 2 mm para acabamento na operação seguinte.",
            revisoesObservacao: [],
          },
          {
            id: "op-3001-4-20",
            sequencia: 20,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [10],
            terceirizada: false,
            tempoXComercial: 2.0,
            tempoYPcp: 2.5,
            tempoZRealizado: 2.8,
            horasMaquina: 2.8,
            horasColaborador: 1.4,
            condicaoLiberacao: "Depende da OP 10 (Serra) concluída",
            revisoes: [],
            observacaoRoteiro: "Manter concentricidade conforme desenho - verificar com relógio comparador antes de liberar para a próxima operação.",
            revisoesObservacao: [],
          },
          {
            id: "op-3001-4-30",
            sequencia: 30,
            descricao: "Fresamento",
            recurso: "Centro de usinagem CNC",
            dependeDe: [20],
            terceirizada: false,
            tempoXComercial: 1.5,
            tempoYPcp: 1.8,
            tempoZRealizado: 1.7,
            condicaoLiberacao: "Depende da OP 20 (Torneamento) concluída",
            revisoes: [],
            observacaoRoteiro: "Fresar rasgo de chaveta conforme desenho.",
            observacaoPcp: "Fresar rasgo de chaveta conforme desenho - peça deste lote veio com sobremetal irregular; conferir cota antes de liberar.",
            revisoesObservacao: [
              {
                id: "rev-obs-op-3001-4-30-seed",
                data: "2026-10-22",
                hora: "09:15",
                responsavel: "Marcos (PCP)",
                textoAnterior: "Fresar rasgo de chaveta conforme desenho.",
                textoNovo: "Fresar rasgo de chaveta conforme desenho - peça deste lote veio com sobremetal irregular; conferir cota antes de liberar.",
                justificativa: "Lote com sobremetal irregular identificado na operação anterior",
              },
            ],
          },
          {
            id: "op-3001-4-40",
            sequencia: 40,
            descricao: "Inspeção",
            recurso: "Qualidade",
            dependeDe: [20, 30],
            terceirizada: false,
            tempoXComercial: 0.5,
            tempoYPcp: 0.5,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende das OPs 20 (Torneamento) e 30 (Fresamento) concluídas",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-3001-5",
        numero: "OF-005",
        codigoPeca: "PC-77005",
        descricaoPeca: "Pino temperado",
        quantidade: 10,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado (Rev. 1)",
        materiaPrima: [
          {
            id: "mp-3001-5-1",
            descricao: "Aço SAE 1045 — Barra redonda Ø 12 mm",
            materialEspecificacao: "Aço SAE 1045",
            formaDimensoes: "Barra redonda Ø 12 mm",
            quantidadeNecessaria: "10 un",
          },
        ],
        servicoExterno: "Tratamento térmico externo — fornecedor Temperaço",
        pendencias: [],
        operacoes: [
          {
            id: "op-3001-5-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.6,
            tempoYPcp: 0.6,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-3001-5-20",
            sequencia: 20,
            descricao: "Tratamento térmico (temperamento + revenimento)",
            recurso: "Externo — Temperaço",
            dependeDe: [10],
            tratamento: "Temperamento + revenimento",
            terceirizada: true,
            tempoXComercial: 0.3,
            tempoYPcp: 0.3,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 10 concluída; envio externo após inspeção dimensional",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-3001-5-30",
            sequencia: 30,
            descricao: "Inspeção final",
            recurso: "Qualidade",
            dependeDe: [10, 20],
            terceirizada: false,
            tempoXComercial: 0.2,
            tempoYPcp: 0.2,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende do retorno do tratamento térmico externo (OP 20)",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
  {
    id: "aguardando-2",
    numeroProjeto: "DEMO-3002",
    nomeCliente: "Usinagem Cardoso Ltda",
    documentoCliente: "PC-4471",
    naturezaComercial: "fabricacao",
    dataEntradaPcp: "2026-10-22",
    dataEntregaComprometida: "2026-11-28",
    pendencias: [],
    ordensFabricacao: [
      {
        id: "of-3002-1",
        numero: "OF-001",
        codigoPeca: "PC-91001",
        descricaoPeca: "Placa de fixação",
        quantidade: 8,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-3002-1-1",
            descricao: "Aço ASTM A36 — Chapa 6,35 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 6,35 mm",
            quantidadeNecessaria: "8 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-3002-1-10",
            sequencia: 10,
            descricao: "Corte a laser",
            recurso: "Laser CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.3,
            tempoYPcp: 0.3,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-3002-1-20",
            sequencia: 20,
            descricao: "Dobra",
            recurso: "Dobradeira CNC",
            dependeDe: [10],
            terceirizada: false,
            tempoXComercial: 0.4,
            tempoYPcp: 0.4,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 10 (Corte a laser) concluída",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
  {
    id: "aguardando-3",
    numeroProjeto: "DEMO-3003",
    nomeCliente: "Metalúrgica Vale do Aço",
    documentoCliente: "OC-88240",
    naturezaComercial: "fabricacao",
    dataEntradaPcp: "2026-10-25",
    dataEntregaComprometida: "2026-12-18",
    pendencias: ["Roteiro ainda em revisão pela Engenharia", "Matéria-prima sem cotação"],
    ordensFabricacao: [
      {
        id: "of-3003-1",
        numero: "OF-001",
        codigoPeca: "PC-33201",
        descricaoPeca: "Corpo de válvula",
        quantidade: 3,
        situacaoLiberacao: "bloqueada",
        desenhoTecnico: "Em revisão pela Engenharia",
        materiaPrima: [
          {
            id: "mp-3003-1-1",
            descricao: "Aço inox 316 — Tarugo Ø 70 mm",
            materialEspecificacao: "Aço inox 316",
            formaDimensoes: "Tarugo Ø 70 mm",
            quantidadeNecessaria: "3 un",
          },
        ],
        pendencias: ["Roteiro ainda em revisão pela Engenharia", "Matéria-prima sem cotação"],
        operacoes: [
          {
            id: "op-3003-1-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.8,
            tempoYPcp: 1.8,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da aprovação do roteiro pela Engenharia e da cotação da matéria-prima",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
  // Momento Y - projetos dedicados a demonstrar as duas naturezas
  // comerciais que a Fabricação sozinha não cobre: Industrialização
  // (fornecimento misto cliente/empresa) e Serviço (OF sem matéria-prima
  // prevista pelo roteiro). Projetos novos, não alteram nenhum projeto já
  // aprovado.
  {
    id: "aguardando-4",
    numeroProjeto: "DEMO-3004",
    nomeCliente: "Usinagem Cardoso Ltda",
    documentoCliente: "PC-5502",
    naturezaComercial: "industrializacao",
    dataEntradaPcp: "2026-10-26",
    dataEntregaComprometida: "2026-11-30",
    pendencias: [],
    ordensFabricacao: [
      {
        id: "of-3004-1",
        numero: "OF-001",
        codigoPeca: "PC-91240",
        descricaoPeca: "Usinagem de eixo fornecido pelo cliente",
        quantidade: 1,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-3004-1-1",
            descricao: "Aço SAE 4140 — Barra redonda Ø 90 mm",
            materialEspecificacao: "Aço SAE 4140",
            formaDimensoes: "Barra redonda Ø 90 mm",
            quantidadeNecessaria: "1 un",
            ajusteOperacional: "Eixo bruto fornecido pelo cliente, conforme contrato.",
          },
          {
            id: "mp-3004-1-2",
            descricao: "Bronze TM23 — Bucha Ø 40 mm",
            materialEspecificacao: "Bronze TM23",
            formaDimensoes: "Bucha Ø 40 mm",
            quantidadeNecessaria: "2 un",
          },
        ],
        catalogoMateriaPrima: [
          {
            materiaPrimaId: "mp-3004-parafuso-m6",
            codigo: "MP-10233",
            descricao: "Parafusos de fixação",
            materialEspecificacao: "Aço inox A2",
            formaDimensoes: "Allen M6x20",
            unidade: "un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-3004-1-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.4,
            tempoYPcp: 1.4,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
  {
    id: "aguardando-5",
    numeroProjeto: "DEMO-3005",
    nomeCliente: "Têmpera Nordeste Ltda",
    documentoCliente: "OC-70188",
    naturezaComercial: "servico",
    dataEntradaPcp: "2026-10-27",
    dataEntregaComprometida: "2026-11-18",
    pendencias: [],
    ordensFabricacao: [
      {
        id: "of-3005-1",
        numero: "OF-001",
        codigoPeca: "PC-68410",
        descricaoPeca: "Tratamento térmico de peça do cliente",
        quantidade: 5,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado",
        materiaPrima: [],
        catalogoMateriaPrima: [
          {
            materiaPrimaId: "mp-3005-embalagem",
            codigo: "MP-30012",
            descricao: "Insumo de embalagem para devolução",
            materialEspecificacao: "Papelão ondulado",
            formaDimensoes: "Caixa reforçada",
            unidade: "un",
          },
        ],
        servicoExterno: "Tratamento térmico — forno próprio",
        pendencias: [],
        operacoes: [
          {
            id: "op-3005-1-10",
            sequencia: 10,
            descricao: "Tratamento térmico (temperamento + revenimento)",
            recurso: "Forno de tratamento térmico",
            dependeDe: [],
            tratamento: "Temperamento + revenimento",
            terceirizada: false,
            tempoXComercial: 0.6,
            tempoYPcp: 0.6,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
  // Natureza da Operação (docs/ARQUITETURA_OPERACIONAL_PCP_NEXOTFE.md,
  // 2026-10-30) - único exemplo de natureza comercial Desenvolvimento no
  // mock, necessário para testar visualmente que a OF mostra "Fabricação"
  // (nunca "Desenvolvimento", "Venda" ou "Venda/Fabricação"), preservando
  // a natureza comercial original intacta ao lado.
  {
    id: "aguardando-6",
    numeroProjeto: "DEMO-3006",
    nomeCliente: "Ferramentaria Progresso",
    documentoCliente: "OC-71290",
    naturezaComercial: "desenvolvimento",
    dataEntradaPcp: "2026-10-28",
    dataEntregaComprometida: "2026-12-20",
    pendencias: [],
    ordensFabricacao: [
      {
        id: "of-3006-1",
        numero: "OF-001",
        codigoPeca: "PC-99001",
        descricaoPeca: "Suporte estrutural (projeto novo)",
        quantidade: 2,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado (Rev. 1)",
        materiaPrima: [
          {
            id: "mp-3006-1-1",
            descricao: "Aço SAE 1045 — Barra redonda Ø 50 mm",
            materialEspecificacao: "Aço SAE 1045",
            formaDimensoes: "Barra redonda Ø 50 mm",
            quantidadeNecessaria: "2 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-3006-1-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.0,
            tempoYPcp: 1.0,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
  // Tabela compacta de matéria-prima (docs, revisão aprovada em 2026-10-30)
  // - OF dedicada a testar a tabela com 20+ materiais, descrições técnicas
  // longas (sem truncar, com quebra de linha) e fornecimento misto
  // (Industrialização: maioria empresa, alguns itens do cliente).
  {
    id: "aguardando-7",
    numeroProjeto: "DEMO-3007",
    nomeCliente: "Metalúrgica Vale do Aço",
    documentoCliente: "OC-90214",
    naturezaComercial: "industrializacao",
    dataEntradaPcp: "2026-10-29",
    dataEntregaComprometida: "2026-12-15",
    pendencias: [],
    ordensFabricacao: [
      {
        id: "of-3007-1",
        numero: "OF-001",
        codigoPeca: "PC-80301",
        descricaoPeca: "Conjunto estrutural de base para prensa hidráulica industrial",
        quantidade: 1,
        situacaoLiberacao: "apta",
        desenhoTecnico: "Aprovado (Rev. 4)",
        materiaPrima: [
          {
            id: "mp-3007-01",
            descricao: "Aço ASTM A572 Grau 50 — Chapa 25,4 mm (1\")",
            materialEspecificacao: "Aço ASTM A572 Grau 50",
            formaDimensoes: "Chapa 25,4 mm (1\")",
            quantidadeNecessaria: "180 kg",
            ajusteOperacional:
              "Corte a plasma conforme desenho DT-80301-A, com furação de fixação em 12 pontos e rebaixo usinado para encaixe do bloco guia.",
          },
          {
            id: "mp-3007-02",
            descricao: "Aço SAE 4340 temperado e retificado — Barra redonda Ø 80 mm",
            materialEspecificacao: "Aço SAE 4340 temperado e retificado",
            formaDimensoes: "Barra redonda Ø 80 mm",
            quantidadeNecessaria: "4 un",
          },
          {
            id: "mp-3007-03",
            descricao: "Bronze TM23 bimetálico — Bucha Ø 80x100 mm",
            materialEspecificacao: "Bronze TM23 bimetálico",
            formaDimensoes: "Bucha Ø 80x100 mm",
            quantidadeNecessaria: "4 un",
            ajusteOperacional:
              "Fornecida pelo cliente conforme especificação técnica do fornecedor original do equipamento - não substituível por equivalente de catálogo sem aprovação da Engenharia do cliente.",
          },
          {
            id: "mp-3007-04",
            descricao: "Parafuso Allen M20x80 — Aço classe 10.9 zincado",
            materialEspecificacao: "Aço classe 10.9 zincado",
            formaDimensoes: "Allen M20x80",
            quantidadeNecessaria: "24 un",
          },
          {
            id: "mp-3007-05",
            descricao: "Porca M20 — Aço classe 10 zincado",
            materialEspecificacao: "Aço classe 10 zincado",
            formaDimensoes: "M20",
            quantidadeNecessaria: "24 un",
          },
          {
            id: "mp-3007-06",
            descricao: "Arruela de pressão M20 — Aço mola zincado",
            materialEspecificacao: "Aço mola zincado",
            formaDimensoes: "M20",
            quantidadeNecessaria: "24 un",
          },
          {
            id: "mp-3007-07",
            descricao: "Aço ASTM A36 — Chapa 12,7 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 12,7 mm",
            quantidadeNecessaria: "35 kg",
            ajusteOperacional: "Lado esquerdo.",
          },
          {
            id: "mp-3007-08",
            descricao: "Aço ASTM A36 — Chapa 12,7 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 12,7 mm",
            quantidadeNecessaria: "35 kg",
            ajusteOperacional: "Lado direito.",
          },
          {
            id: "mp-3007-09",
            descricao: "Aço ASTM A572 Grau 50 — Perfil U 200x75x20 mm",
            materialEspecificacao: "Aço ASTM A572 Grau 50",
            formaDimensoes: "Perfil U 200x75x20 mm",
            quantidadeNecessaria: "2 un",
          },
          {
            id: "mp-3007-10",
            descricao: "Conjunto hidráulico original do fabricante — Diâmetro 160 mm, curso 400 mm",
            materialEspecificacao: "Conjunto hidráulico original do fabricante",
            formaDimensoes: "Diâmetro 160 mm, curso 400 mm",
            quantidadeNecessaria: "1 un",
            ajusteOperacional:
              "Componente fornecido pelo cliente junto com o conjunto hidráulico original - deve ser preservado e reinstalado sem modificação na nova estrutura de base.",
          },
          {
            id: "mp-3007-11",
            descricao: "Reforçada trançado duplo, 350 bar — Diâmetro interno 1/2\"",
            materialEspecificacao: "Reforçada trançado duplo, 350 bar",
            formaDimensoes: "Diâmetro interno 1/2\"",
            quantidadeNecessaria: "3 un",
          },
          {
            id: "mp-3007-12",
            descricao: "Aço inox 316, rosca BSP — 1/2\" macho/fêmea",
            materialEspecificacao: "Aço inox 316, rosca BSP",
            formaDimensoes: "1/2\" macho/fêmea",
            quantidadeNecessaria: "6 un",
          },
          {
            id: "mp-3007-13",
            descricao: "Aço SAE 4140 temperado — Barra redonda Ø 40 mm",
            materialEspecificacao: "Aço SAE 4140 temperado",
            formaDimensoes: "Barra redonda Ø 40 mm",
            quantidadeNecessaria: "2 un",
          },
          {
            id: "mp-3007-14",
            descricao: "Fornecido pelo cliente, mesmo modelo do equipamento original — Rolamento Ø 80 mm",
            materialEspecificacao: "Fornecido pelo cliente, mesmo modelo do equipamento original",
            formaDimensoes: "Rolamento Ø 80 mm",
            quantidadeNecessaria: "2 un",
          },
          {
            id: "mp-3007-15",
            descricao: "Aço ASTM A36 — Chapa 19 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 19 mm",
            quantidadeNecessaria: "60 kg",
          },
          {
            id: "mp-3007-16",
            descricao: "Chumbador M24x300 — Aço galvanizado a fogo",
            materialEspecificacao: "Aço galvanizado a fogo",
            formaDimensoes: "M24x300",
            quantidadeNecessaria: "8 un",
          },
          {
            id: "mp-3007-17",
            descricao: "Epóxi zarcão, 2 demãos — Galão 3,6 L",
            materialEspecificacao: "Epóxi zarcão, 2 demãos",
            formaDimensoes: "Galão 3,6 L",
            quantidadeNecessaria: "2 un",
          },
          {
            id: "mp-3007-18",
            descricao: "Esmalte sintético, cor padrão cliente RAL 7035 — Galão 3,6 L",
            materialEspecificacao: "Esmalte sintético, cor padrão cliente RAL 7035",
            formaDimensoes: "Galão 3,6 L",
            quantidadeNecessaria: "2 un",
          },
          {
            id: "mp-3007-19",
            descricao: "Painel de tela soldada galvanizada — Painel 1200x2000 mm",
            materialEspecificacao: "Painel de tela soldada galvanizada",
            formaDimensoes: "Painel 1200x2000 mm",
            quantidadeNecessaria: "4 un",
            ajusteOperacional:
              "Projeto e material fornecidos pelo cliente conforme norma interna de segurança do equipamento - não pode ser substituída por solução equivalente sem autorização formal.",
          },
          {
            id: "mp-3007-20",
            descricao: "Dobradiça reforçada 100 mm — Aço inox 304",
            materialEspecificacao: "Aço inox 304",
            formaDimensoes: "Dobradiça reforçada 100 mm",
            quantidadeNecessaria: "4 un",
          },
          {
            id: "mp-3007-21",
            descricao: "Aço inox 304 com intertravamento elétrico — Padrão NR-12",
            materialEspecificacao: "Aço inox 304 com intertravamento elétrico",
            formaDimensoes: "Padrão NR-12",
            quantidadeNecessaria: "1 un",
          },
          {
            id: "mp-3007-22",
            descricao: "Vinil adesivo resistente a óleo — Conjunto padrão NR-12",
            materialEspecificacao: "Vinil adesivo resistente a óleo",
            formaDimensoes: "Conjunto padrão NR-12",
            quantidadeNecessaria: "1 un",
          },
        ],
        catalogoMateriaPrima: [
          {
            materiaPrimaId: "mp-3007-cat-arruela-lisa",
            codigo: "MP-10512",
            descricao: "Arruela lisa",
            materialEspecificacao: "Aço zincado",
            formaDimensoes: "M20",
            unidade: "un",
          },
          {
            materiaPrimaId: "mp-3007-cat-grxaxeira",
            codigo: "MP-40221",
            descricao: "Graxeira para bucha de guia",
            materialEspecificacao: "Aço zincado, rosca 1/8\" NPT",
            formaDimensoes: "Padrão",
            unidade: "un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-3007-1-10",
            sequencia: 10,
            descricao: "Corte a plasma",
            recurso: "Mesa de corte CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 3.5,
            tempoYPcp: 3.5,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            observacaoRoteiro:
              "Corte conforme desenho DT-80301-A - conferir esquadro das bordas antes de liberar para a usinagem de rebaixos; chapa recebe furação de fixação em 12 pontos na operação seguinte, sem margem para retrabalho de corte depois de furada.",
            revisoesObservacao: [],
          },
          {
            id: "op-3007-1-20",
            sequencia: 20,
            descricao: "Usinagem de rebaixos e furação",
            recurso: "Centro de usinagem CNC",
            dependeDe: [10],
            terceirizada: false,
            tempoXComercial: 6.0,
            tempoYPcp: 6.0,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 10 (Corte a plasma) concluída",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-3007-1-30",
            sequencia: 30,
            descricao: "Montagem estrutural e soldagem",
            recurso: "Posto de solda estrutural",
            dependeDe: [20],
            terceirizada: false,
            tempoXComercial: 8.0,
            tempoYPcp: 8.0,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 20 (Usinagem) concluída",
            revisoes: [],
            observacaoRoteiro: "Solda em sequência cruzada para reduzir empenamento - inspeção visual de cordões antes da pintura.",
            revisoesObservacao: [],
          },
          {
            id: "op-3007-1-40",
            sequencia: 40,
            descricao: "Pintura industrial",
            recurso: "Cabine de pintura",
            dependeDe: [30],
            terceirizada: false,
            tempoXComercial: 2.0,
            tempoYPcp: 2.0,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 30 (Montagem) concluída",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-3007-1-50",
            sequencia: 50,
            descricao: "Montagem final e instalação do conjunto hidráulico do cliente",
            recurso: "Bancada de montagem final",
            dependeDe: [40],
            terceirizada: false,
            tempoXComercial: 4.0,
            tempoYPcp: 4.0,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 40 (Pintura) concluída",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
  },
];

export const PROJETOS_LIBERADOS_MOCK: ProjetoLiberadoMock[] = [
  {
    id: "liberado-1",
    numeroProjeto: "DEMO-2101",
    nomeCliente: "Ferramentaria Progresso",
    documentoCliente: "PC-9920",
    naturezaComercial: "fabricacao",
    dataEntregaComprometida: "2026-11-10",
    prioridade: 1,
    dataConclusaoPrevista: "2026-11-10",
    pendenciasOperacionais: [],
    pendenciasExternas: [],
    requisicoesCompra: [],
    observacoesPcp: [
      {
        id: "obs-1101-1",
        data: "2026-10-24",
        hora: "09:15",
        responsavel: "Marcos (PCP)",
        texto: "OF-1 iniciada conforme programação; sem pendências neste momento.",
      },
      {
        id: "obs-1101-2",
        data: "2026-10-27",
        hora: "16:40",
        responsavel: "Marcos (PCP)",
        texto: "Cliente solicitou confirmação de prazo por telefone; parecer repassado ao Comercial.",
      },
    ],
    ordensFabricacao: [
      {
        id: "of-2101-1",
        numero: "OF-001",
        codigoPeca: "PC-11001",
        descricaoPeca: "Corpo da ferramenta",
        quantidade: 2,
        situacaoLiberacao: "liberada",
        liberacao: { responsavel: "Marcos (PCP)", data: "2026-10-18", hora: "11:00" },
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2101-1-1",
            descricao: "Aço SAE 4140 — Bloco 80x80x50 mm",
            materialEspecificacao: "Aço SAE 4140",
            formaDimensoes: "Bloco 80x80x50 mm",
            quantidadeNecessaria: "2 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-2101-1-10",
            sequencia: 10,
            descricao: "Fresamento",
            recurso: "Centro de usinagem CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.2,
            tempoYPcp: 1.2,
            tempoZRealizado: 1.3,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-2101-1-20",
            sequencia: 20,
            descricao: "Inspeção",
            recurso: "Qualidade",
            dependeDe: [10],
            terceirizada: false,
            tempoXComercial: 0.3,
            tempoYPcp: 0.3,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 10 (Fresamento) concluída",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
    historico: [
      { data: "2026-10-18", evento: "Projeto liberado para programação" },
      { data: "2026-10-24", evento: "OF-1 iniciada" },
    ],
  },
  {
    id: "liberado-2",
    numeroProjeto: "DEMO-2102",
    nomeCliente: "Metalúrgica Vale do Aço",
    documentoCliente: "OC-87990",
    naturezaComercial: "fabricacao",
    dataEntregaComprometida: "2026-11-22",
    prioridade: 2,
    // Resultado hipotético que o Motor daria SE a OF-003 fosse liberada e
    // não houvesse a lacuna de recurso abaixo - propositalmente mantido
    // para o teste "liberar tudo não é suficiente" (regra 9 do pedido).
    dataConclusaoPrevista: "2026-11-25",
    pendenciasOperacionais: ["OF-3 aguardando matéria-prima"],
    pendenciasExternas: ["Desenho revisão 2 ainda em aprovação pela Engenharia"],
    requisicoesCompra: [
      {
        numero: "260145",
        materiais: [
          {
            descricao: "Aço SAE 1045 Ø 50 mm",
            situacao: "pedido_emitido",
            dataPrevista: "2026-10-30",
          },
          {
            descricao: "Chapa ASTM A36 12,7 mm",
            situacao: "em_orcamento",
          },
        ],
      },
      {
        numero: "260146",
        materiais: [
          {
            descricao: "Barra alumínio 6061 Ø 30 mm",
            situacao: "recebido",
            dataRecebimento: "2026-10-28",
          },
        ],
      },
      {
        numero: "260147",
        materiais: [
          {
            descricao: "Rolamento SKF 6204",
            situacao: "recebido_parcial",
            dataRecebimento: "2026-10-26",
            detalheQuantidade: "2 de 5 unidades recebidas — restante ainda com o fornecedor",
          },
          {
            descricao: "Parafuso allen M8x40 inox",
            situacao: "pedido_emitido",
          },
        ],
      },
    ],
    observacoesPcp: [],
    ordensFabricacao: [
      {
        id: "of-2102-1",
        numero: "OF-001",
        codigoPeca: "PC-55101",
        descricaoPeca: "Flange soldada",
        quantidade: 3,
        situacaoLiberacao: "liberada",
        liberacao: { responsavel: "Marcos (PCP)", data: "2026-10-20", hora: "10:30" },
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2102-1-1",
            descricao: "Aço ASTM A36 — Chapa 9,5 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 9,5 mm",
            quantidadeNecessaria: "3 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-2102-1-10",
            sequencia: 10,
            descricao: "Solda",
            recurso: "Posto de solda",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.0,
            tempoYPcp: 1.0,
            tempoZRealizado: 1.1,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-2102-1-20",
            sequencia: 20,
            descricao: "Inspeção",
            recurso: "Qualidade",
            dependeDe: [10],
            terceirizada: false,
            tempoXComercial: 0.3,
            tempoYPcp: 0.3,
            tempoZRealizado: 0.3,
            condicaoLiberacao: "Depende da OP 10 (Solda) concluída",
            semRecursoProdutivo: true,
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-2102-2",
        numero: "OF-002",
        codigoPeca: "PC-55102",
        descricaoPeca: "Base nivelada",
        quantidade: 2,
        situacaoLiberacao: "liberada",
        liberacao: { responsavel: "Marcos (PCP)", data: "2026-10-20", hora: "10:32" },
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2102-2-1",
            descricao: "Ferro fundido GG25 — Bloco 150x100x40 mm",
            materialEspecificacao: "Ferro fundido GG25",
            formaDimensoes: "Bloco 150x100x40 mm",
            quantidadeNecessaria: "2 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-2102-2-10",
            sequencia: 10,
            descricao: "Fresamento",
            recurso: "Centro de usinagem CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.9,
            tempoYPcp: 0.9,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-2102-3",
        numero: "OF-003",
        codigoPeca: "PC-55103",
        descricaoPeca: "Eixo intermediário",
        quantidade: 1,
        situacaoLiberacao: "bloqueada",
        desenhoTecnico: "Revisão 2 em aprovação pela Engenharia",
        materiaPrima: [
          {
            id: "mp-2102-3-1",
            descricao: "Aço SAE 1045 — Barra redonda Ø 50 mm",
            materialEspecificacao: "Aço SAE 1045",
            formaDimensoes: "Barra redonda Ø 50 mm",
            quantidadeNecessaria: "1 un",
            ajusteOperacional: "Aguardando Requisições 260145/260147 — ver Requisições de Compras",
          },
        ],
        pendencias: ["Aguardando matéria-prima (ver Requisições de Compras)"],
        operacoes: [
          {
            id: "op-2102-3-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 1.5,
            tempoYPcp: 1.5,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende do recebimento integral da matéria-prima",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
      {
        id: "of-2102-4",
        numero: "OF-004",
        codigoPeca: "PC-55104",
        descricaoPeca: "Tampa de proteção",
        quantidade: 5,
        situacaoLiberacao: "liberada",
        liberacao: { responsavel: "Marcos (PCP)", data: "2026-10-20", hora: "10:35" },
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2102-4-1",
            descricao: "Aço ASTM A36 — Chapa 3,2 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 3,2 mm",
            quantidadeNecessaria: "5 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-2102-4-10",
            sequencia: 10,
            descricao: "Corte a laser",
            recurso: "Laser CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.4,
            tempoYPcp: 0.4,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
    historico: [{ data: "2026-10-19", evento: "Projeto liberado para programação" }],
  },
  {
    id: "liberado-3",
    numeroProjeto: "DEMO-2103",
    nomeCliente: "Usinagem Cardoso Ltda",
    documentoCliente: "PC-4390",
    naturezaComercial: "fabricacao",
    dataEntregaComprometida: "2026-10-30",
    prioridade: 3,
    dataConclusaoPrevista: "2026-11-04",
    pendenciasOperacionais: [],
    pendenciasExternas: [],
    requisicoesCompra: [],
    observacoesPcp: [],
    ordensFabricacao: [
      {
        id: "of-2103-1",
        numero: "OF-001",
        codigoPeca: "PC-43901",
        descricaoPeca: "Anel de vedação usinado",
        quantidade: 12,
        situacaoLiberacao: "liberada",
        liberacao: { responsavel: "Marcos (PCP)", data: "2026-10-12", hora: "14:00" },
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2103-1-1",
            descricao: "Nylon técnico — Barra redonda Ø 25 mm",
            materialEspecificacao: "Nylon técnico",
            formaDimensoes: "Barra redonda Ø 25 mm",
            quantidadeNecessaria: "12 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-2103-1-10",
            sequencia: 10,
            descricao: "Torneamento",
            recurso: "Torno CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.3,
            tempoYPcp: 0.3,
            tempoZRealizado: 0.3,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
    historico: [{ data: "2026-10-12", evento: "Projeto liberado para programação" }],
  },
  {
    id: "liberado-4",
    numeroProjeto: "DEMO-2104",
    nomeCliente: "Retífica Horizonte",
    documentoCliente: "OC-55012",
    naturezaComercial: "fabricacao",
    dataEntregaComprometida: "2026-12-01",
    prioridade: 4,
    dataConclusaoPrevista: null,
    pendenciasOperacionais: ["Nenhuma OF liberada ainda"],
    pendenciasExternas: ["Tratamento térmico terceirizado — retorno previsto para 05/11/2026"],
    requisicoesCompra: [],
    observacoesPcp: [],
    ordensFabricacao: [
      {
        id: "of-2104-1",
        numero: "OF-001",
        codigoPeca: "PC-77801",
        descricaoPeca: "Rolo retificado",
        quantidade: 1,
        situacaoLiberacao: "bloqueada",
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2104-1-1",
            descricao: "Aço SAE 52100 — Barra redonda Ø 55 mm",
            materialEspecificacao: "Aço SAE 52100",
            formaDimensoes: "Barra redonda Ø 55 mm",
            quantidadeNecessaria: "1 un",
          },
        ],
        servicoExterno: "Tratamento térmico externo — retorno previsto para 05/11/2026",
        pendencias: ["Aguardando retorno do tratamento térmico externo"],
        operacoes: [
          {
            id: "op-2104-1-10",
            sequencia: 10,
            descricao: "Retífica",
            recurso: "Retificadora",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.8,
            tempoYPcp: 0.8,
            tempoZRealizado: null,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
          {
            id: "op-2104-1-20",
            sequencia: 20,
            descricao: "Tratamento térmico",
            recurso: "Externo",
            dependeDe: [10],
            tratamento: "Tempera superficial",
            terceirizada: true,
            tempoXComercial: 0.2,
            tempoYPcp: 0.2,
            tempoZRealizado: null,
            condicaoLiberacao: "Depende da OP 10 (Retífica) concluída; envio externo",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
    historico: [{ data: "2026-10-27", evento: "Projeto liberado para programação" }],
  },
  {
    id: "liberado-5",
    numeroProjeto: "DEMO-2105",
    nomeCliente: "Metalúrgica Vale do Aço",
    documentoCliente: "OC-86700",
    naturezaComercial: "fabricacao",
    dataEntregaComprometida: "2026-11-15",
    prioridade: 5,
    dataConclusaoPrevista: "2026-11-09",
    pendenciasOperacionais: [],
    pendenciasExternas: [],
    requisicoesCompra: [],
    observacoesPcp: [],
    ordensFabricacao: [
      {
        id: "of-2105-1",
        numero: "OF-001",
        codigoPeca: "PC-86701",
        descricaoPeca: "Suporte de fixação",
        quantidade: 4,
        situacaoLiberacao: "liberada",
        liberacao: { responsavel: "Marcos (PCP)", data: "2026-09-30", hora: "09:00" },
        desenhoTecnico: "Aprovado",
        materiaPrima: [
          {
            id: "mp-2105-1-1",
            descricao: "Aço ASTM A36 — Chapa 4,75 mm",
            materialEspecificacao: "Aço ASTM A36",
            formaDimensoes: "Chapa 4,75 mm",
            quantidadeNecessaria: "4 un",
          },
        ],
        pendencias: [],
        operacoes: [
          {
            id: "op-2105-1-10",
            sequencia: 10,
            descricao: "Corte a laser",
            recurso: "Laser CNC",
            dependeDe: [],
            terceirizada: false,
            tempoXComercial: 0.3,
            tempoYPcp: 0.3,
            tempoZRealizado: 0.3,
            condicaoLiberacao: "Nenhuma dependência - pode iniciar imediatamente",
            revisoes: [],
            revisoesObservacao: [],
          },
        ],
      },
    ],
    historico: [{ data: "2026-09-30", evento: "Projeto liberado para programação" }],
  },
];
