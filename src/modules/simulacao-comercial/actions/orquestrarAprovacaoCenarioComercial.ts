// Orquestrador da aprovação do cenário comercial (DEC-007 §6.2/Fase 8b) -
// mesmo princípio estrutural de orquestrarAprovacaoAutoritativa.ts (motor
// antigo): extraído sem "use server" para ter dependências injetadas,
// testável sem sessão real do Supabase.
//
// CONTRATO DE SEGURANÇA (correção explícita pedida pelo usuário - ver
// também o cabeçalho da migration 202608180002): este orquestrador é o
// caminho OFICIAL da aplicação, porque é ele quem RECALCULA a previsão
// comercial (avaliarPrevisaoComercialFlexivel/montarPrevisaoComercialProjeto,
// só existe em TypeScript) e o "valor atual do orçamento" a partir de
// dado fresco do servidor - nunca confia no que o navegador exibiu. A
// RPC (aprovar_cenario_comercial_v2) NÃO reconstrói essa previsão
// sozinha (impossível em SQL); ela só verifica o que É verificável em
// SQL (tenant/permissão/forma/soma). Sem cliente privilegiado, um
// admin não consegue mais chamar a RPC direto (service_role-only,
// abaixo) - o único caminho possível PARA ESTA RPC é este orquestrador.
//
// Migração 20260822165408, Fase 1 da transição em duas fases (correção
// do achado do orçamento 260007 - ver cabeçalho da migration): duas
// mudanças de contrato neste orquestrador, ambas exigidas pela RPC
// NOVA aprovar_cenario_comercial_v2 (service_role-only) - a RPC antiga
// (aprovar_cenario_comercial, 12 parâmetros) continua existindo no
// banco, intocada, mas nada neste orquestrador a chama mais:
// - `buscarEmpresaId` foi substituído por `autorizarAprovador`, que
//   verifica a MESMA regra hoje aplicada por usuario_e_admin() (perfil
//   ativo, nivel_acesso=admin, em public.profiles) e resolve o
//   empresa_id a partir dessa MESMA linha - a nova RPC roda sob
//   service_role (sem JWT), então auth.uid()/empresa_atual_id()/
//   usuario_e_admin() não podem mais resolver isso sozinhos dentro
//   dela; a checagem precisa acontecer aqui, com o client de sessão,
//   ANTES de qualquer client privilegiado ser criado (só
//   aprovarCenarioComercialAction.ts, na implementação real de
//   `persistir`, cria o client privilegiado - nunca este orquestrador);
// - `calcularAssinaturaTecnica` computa o hash estrutural da base
//   técnica (construirDocumentoAssinaturaTecnica.ts) sobre a MESMA
//   janela produtiva (disponibilidadeOriginal/primeiraEntregaPossivel)
//   que entra no snapshot - nunca uma janela reconstruída à parte -
//   gravado junto com custo/snapshot no mesmo `persistir`, garantindo
//   que os três vêm da mesma carga autoritativa desta chamada.
//
// Nenhum client privilegiado (service_role) é usado ou injetado NESTE
// arquivo - todas as dependências de I/O daqui usam a sessão real do
// usuário (RLS aplicada normalmente); o client privilegiado só existe
// dentro da implementação real de `persistir` (aprovarCenarioComercialAction.ts),
// nunca antes de autenticar/autorizar.
import type {
  PremissasJanelaComercial,
  ResultadoJanelaComercial,
  JanelaComercialInvalida,
  ModoDisponibilidadeMaterial,
} from "../lib/prepararJanelaComercial";
import type { ProjectType } from "@/modules/projetos/types";
import type { BasePrevisaoComercial, DiagnosticoPrevisaoComercial } from "../lib/cenarios/carregarBasePrevisaoComercial";
import { montarPrevisaoComercialProjeto, type CenarioParaPrevisaoComercial } from "../lib/cenarios/montarPrevisaoComercialProjeto";
import { construirSnapshotCenarioComercial } from "../lib/cenarios/cenarioComercialAprovadoSnapshot";
import { compararDadosParaAprovacaoCenario, type DivergenciaAprovacaoCenario } from "../lib/cenarios/compararDadosParaAprovacaoCenario";
import type { ResultadoPersistenciaAprovacaoCenario } from "../lib/persistirViaRpcAprovacaoCenario";
import type { ParametrosPayloadAprovacaoCenario } from "../lib/montarPayloadAprovacaoCenario";
import type { PayloadAprovacaoCenario } from "./validarPayloadAprovacaoCenario";
import { executarComTimeout, TimeoutEtapaError } from "../lib/executarComTimeout";
import { calcularHashSolicitacaoAprovacaoCenario } from "../lib/calcularHashSolicitacaoAprovacaoCenario";

export const MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO =
  "Não foi possível concluir a aprovação do cenário comercial. Recalcule a previsão comercial e tente novamente.";

// Achado real (travamento em "Aprovando..." no orçamento 260007, DEC-007
// - migração 20260822195805): cada etapa de I/O anterior à gravação tem
// seu próprio orçamento de tempo, para nunca depender de uma promise que
// pode travar sem nunca resolver nem rejeitar (mesma classe de bug já
// documentada em AuthGate.tsx para o lock interno do client Supabase).
// `persistir` (a chamada à RPC) DELIBERADAMENTE não tem timeout aqui -
// uma vez iniciada a gravação, o correto é aguardar a resposta
// DEFINITIVA (sucesso, erro limpo, ou falha ambígua de rede - ver
// persistirViaRpcAprovacaoCenario.ts) - nunca desistir no meio e arriscar
// tratar como "falhou" uma escrita que na verdade só demorou.
const TIMEOUT_AUTORIZAR_APROVADOR_MS = 8_000;
const TIMEOUT_VALORES_ORCAMENTO_MS = 8_000;
const TIMEOUT_JANELA_MS = 8_000;
const TIMEOUT_BASE_MS = 8_000;
const TIMEOUT_ASSINATURA_TECNICA_MS = 15_000;

export type ResultadoAprovacaoCenarioAction =
  | { ok: true; cenarioComercialAprovadoId: string }
  | { ok: false; motivo: "nao_autenticado" }
  /** Autenticado, mas sem perfil ativo de administrador (public.profiles) - MESMA regra hoje aplicada por usuario_e_admin(), verificada aqui porque a RPC não tem mais JWT para resolvê-la sozinha. */
  | { ok: false; motivo: "nao_autorizado" }
  | { ok: false; motivo: "sem_janela_produtiva"; detalhe: JanelaComercialInvalida }
  /** O navegador está pedindo para aprovar algo diferente do que o servidor recalculou agora - nunca aprova "no escuro". */
  | { ok: false; motivo: "divergente"; diferencas: DivergenciaAprovacaoCenario[] }
  | { ok: false; motivo: "sem_prazo_calculavel" }
  | { ok: false; motivo: "sem_orcamento_resolvivel" }
  /** Uma etapa ANTERIOR à gravação excedeu seu orçamento de tempo - nada foi gravado (a RPC nem chegou a ser chamada). `etapa` identifica qual, para diagnóstico. Recuperável: o cliente pode tentar de novo com a MESMA chaveIdempotencia. */
  | { ok: false; motivo: "tempo_esgotado"; etapa: string }
  /**
   * Achado real (correção do usuário): uma etapa ANTERIOR à gravação
   * lançou um erro que NÃO foi timeout (ex.: consulta rejeitada,
   * exceção do próprio código) - nada foi gravado. `etapa`/`duracaoMs`
   * identificam qual etapa e quanto tempo rodou até falhar, para
   * diagnóstico (nunca a mensagem técnica bruta, que só vai para o log
   * do servidor). Recuperável: o cliente pode tentar de novo com a
   * MESMA chaveIdempotencia.
   */
  | { ok: false; motivo: "falha_etapa"; etapa: string; duracaoMs: number }
  /**
   * A CHAMADA DE REDE à RPC falhou sem completar um ciclo requisição/
   * resposta (ver persistirViaRpcAprovacaoCenario.ts) - não se sabe se a
   * aprovação foi gravada ou não. O cliente NUNCA deve tratar isto como
   * "falhou" nem "funcionou" diretamente - precisa consultar (leitura)
   * se um cenário com a mesma chaveIdempotencia já existe antes de
   * decidir (sucesso silencioso) ou liberar nova tentativa (mesma
   * chave - a RPC é idempotente).
   */
  | { ok: false; motivo: "gravacao_incerta" }
  | { ok: false; motivo: "erro"; mensagem: string };

export interface ValoresOrcamentoAtual {
  /** "Valor atual do orçamento" desta feature = custo TÉCNICO (custoTotal), sem margem/imposto/desconto. */
  readonly custoTecnicoAtual: number;
  /** Só informativo (valorComercial, já com margem/imposto/desconto) - nunca usado na soma que produz o novo valor-base. */
  readonly valorComercialAtualReferencia: number | null;
  /**
   * Natureza do projeto (projetos.tipo_projeto) - decide a disponibilidade
   * de material do orçamento novo (ver montarCenarioParaPrevisao):
   * Industrialização usa a Data Prevista de Aprovação do Pedido, sem
   * negociação possível, NUNCA confiando no que o payload do cliente
   * enviou para essa decisão (mesma disciplina do resto deste módulo).
   */
  readonly tipoProjeto: ProjectType;
}

export interface AutorizacaoAprovadorCenario {
  /** public.profiles.empresa_id do aprovador - MESMO valor que empresa_atual_id() resolveria para este usuário hoje (perfil ativo tem prioridade sobre public.usuarios). */
  readonly empresaId: string;
}

export interface DependenciasAprovacaoCenarioComercial {
  /** Resolve o usuário autenticado a partir da sessão do servidor (auth.getUser(), nunca getSession()). null = não autenticado. */
  autenticar: () => Promise<string | null>;
  /** Verifica que o usuário é administrador ativo (public.profiles: ativo=true, nivel_acesso='admin' - MESMO predicado de usuario_e_admin(), reproduzido aqui porque a RPC agora roda sob service_role, sem JWT) e resolve seu empresa_id. null = não autorizado (sem perfil, inativo, ou não-admin). */
  autorizarAprovador: (userId: string) => Promise<AutorizacaoAprovadorCenario | null>;
  /** Recalcula a janela comercial a partir das premissas, contra o Calendário Operacional corrente - nunca a do navegador. `modoDisponibilidadeMaterial` é resolvido pelo ORQUESTRADOR (a partir de ValoresOrcamentoAtual.tipoProjeto, buscado antes) - nunca confiado ao payload do cliente. */
  prepararJanela: (
    empresaId: string,
    premissas: PremissasJanelaComercial,
    modoDisponibilidadeMaterial: ModoDisponibilidadeMaterial,
  ) => Promise<ResultadoJanelaComercial>;
  /** Recarrega a base da Previsão comercial por capacidade do zero, no servidor - nunca reaproveita nada calculado no navegador. */
  carregarBase: (
    empresaId: string,
    projetoId: string,
    dataSolicitadaCliente: string,
    janelaInicioGrade: string,
    dataReferenciaConfirmados: string,
    prazoInterno: string,
  ) => Promise<BasePrevisaoComercial>;
  /** "Valor atual do orçamento" recalculado do zero (buscarDadosOrcamento + calcularValorComercialProjeto) - nunca o que o navegador exibiu. null = orçamento do projeto não resolvível agora. */
  buscarValoresOrcamentoAtual: (empresaId: string, projetoId: string) => Promise<ValoresOrcamentoAtual | null>;
  /** Hash SHA-256 hex da base técnica atual (construirDocumentoAssinaturaTecnica.ts), calculado sobre a MESMA janela produtiva (disponibilidadeOriginal/primeiraEntregaPossivel) que entra no snapshot - client de SESSÃO, nunca privilegiado (é só leitura). */
  calcularAssinaturaTecnica: (
    empresaId: string,
    projetoId: string,
    janelaInicio: string,
    janelaFim: string,
  ) => Promise<string>;
  /** Chamada à RPC aprovar_cenario_comercial_v2 (client PRIVILEGIADO, service_role - criado pelo chamador só neste ponto, nunca antes) - só invocada quando não há nenhuma divergência. */
  persistir: (params: ParametrosPayloadAprovacaoCenario) => Promise<ResultadoPersistenciaAprovacaoCenario>;
}

/**
 * `naturezaIndustrializacao` (projeto de Industrialização, orçamento
 * 260007, DEC-007): quando true, IGNORA só os 2 campos de MATERIAL do
 * payload (`disponibilidadeMaterialNegociada`/`contratacaoNegociacaoMaterial`),
 * mesmo que o cliente os tenha enviado preenchidos - nunca confia no
 * navegador para decidir se uma negociação de material é permitida
 * (mesma disciplina de recalcular tudo no servidor já documentada no
 * cabeçalho deste arquivo). Hora adicional/recurso temporário
 * (`capacidadeExtraAutorizada`/`temporariosPorPrioridade`/`contratacoes`)
 * são um eixo INDEPENDENTE, sem nenhuma regra pedida para
 * Industrialização - continuam seguindo `tipoCenario` normalmente.
 * `disponibilidadeOriginal` já chega resolvida pelo chamador (Data
 * Prevista de Aprovação do Pedido para Industrialização).
 */
function montarCenarioParaPrevisao(
  params: PayloadAprovacaoCenario,
  disponibilidadeOriginal: string,
  naturezaIndustrializacao: boolean,
): CenarioParaPrevisaoComercial {
  if (params.tipoCenario === "atual") {
    return {
      capacidadeExtraAutorizada: [],
      temporariosPorPrioridade: [],
      disponibilidadeMaterialOrcamentoNovo: disponibilidadeOriginal,
      contratacoes: [],
      contratacaoNegociacaoMaterial: null,
    };
  }

  return {
    capacidadeExtraAutorizada: params.capacidadeExtraAutorizada,
    temporariosPorPrioridade: params.temporariosPorPrioridade,
    disponibilidadeMaterialOrcamentoNovo: naturezaIndustrializacao
      ? disponibilidadeOriginal
      : (params.disponibilidadeMaterialNegociada ?? disponibilidadeOriginal),
    contratacoes: params.contratacoes,
    contratacaoNegociacaoMaterial: naturezaIndustrializacao ? null : params.contratacaoNegociacaoMaterial,
  };
}

function diagnosticosParaLog(diagnosticos: readonly DiagnosticoPrevisaoComercial[]): string {
  return diagnosticos.map((d) => d.motivo).join("; ");
}

export async function orquestrarAprovacaoCenarioComercial(
  params: PayloadAprovacaoCenario,
  deps: DependenciasAprovacaoCenarioComercial,
): Promise<ResultadoAprovacaoCenarioAction> {
  // Achado real (correção do usuário: "exibir a etapa que excedeu o
  // tempo OU retornou erro"): rastreados aqui fora do try/catch para o
  // catch-all, no fim da função, poder atribuir QUALQUER exceção (não
  // só TimeoutEtapaError) à etapa em andamento no momento - nunca só
  // "erro genérico" quando se sabe exatamente onde parou. Resetado para
  // null a cada etapa concluída com sucesso - um erro em código puro
  // ENTRE etapas (nunca deveria acontecer, mas se acontecer) cai no
  // "erro" genérico de sempre, nunca atribuído à etapa anterior por
  // engano.
  let etapaAtual: string | null = null;
  let inicioEtapaMs = 0;

  async function executarEtapa<T>(nome: string, timeoutMs: number, operacao: () => Promise<T>): Promise<T> {
    etapaAtual = nome;
    inicioEtapaMs = Date.now();
    const resultado = await executarComTimeout(operacao, timeoutMs, nome);
    etapaAtual = null;
    return resultado;
  }

  try {
    // autenticar() usa o mesmo client Supabase (auth.getUser()) que já
    // documentou o lock interno do GoTrueClient travando para sempre em
    // AuthGate.tsx - mesma proteção das demais etapas, pelo mesmo motivo.
    const userId = await executarEtapa("autenticar", TIMEOUT_AUTORIZAR_APROVADOR_MS, () => deps.autenticar());
    if (!userId) {
      return { ok: false, motivo: "nao_autenticado" };
    }

    const autorizacao = await executarEtapa("autorizar-aprovador", TIMEOUT_AUTORIZAR_APROVADOR_MS, () =>
      deps.autorizarAprovador(userId),
    );
    if (!autorizacao) {
      return { ok: false, motivo: "nao_autorizado" };
    }
    const empresaId = autorizacao.empresaId;

    // Buscado ANTES de preparar a janela (`tipoProjeto` decide
    // modoDisponibilidadeMaterial abaixo) - nunca confia em nenhum dado
    // de natureza enviado pelo cliente para essa decisão.
    const valoresOrcamento = await executarEtapa("buscar-valores-orcamento-atual", TIMEOUT_VALORES_ORCAMENTO_MS, () =>
      deps.buscarValoresOrcamentoAtual(empresaId, params.projetoId),
    );
    if (!valoresOrcamento) {
      return { ok: false, motivo: "sem_orcamento_resolvivel" };
    }
    const naturezaIndustrializacao = valoresOrcamento.tipoProjeto === "industrializacao";

    // Janela comercial recalculada no servidor - nunca a que o navegador
    // exibiu (calendário/premissas podem ter mudado nesse meio-tempo).
    // CORREÇÃO (projeto de Industrialização, orçamento 260007, DEC-007):
    // modoDisponibilidadeMaterial centraliza em prepararJanelaComercial a
    // decisão de qual é a disponibilidade real de material por natureza -
    // janelaServidor.dataDisponibilidadeProducao já vem correta para
    // qualquer natureza, sem precisar de um segundo cálculo aqui.
    const janelaServidor = await executarEtapa("preparar-janela", TIMEOUT_JANELA_MS, () =>
      deps.prepararJanela(
        empresaId,
        {
          dataNecessidade: params.dataNecessidade,
          margemSegurancaDiasProdutivos: params.margemSegurancaDias,
          dataPrevistaAprovacaoPedido: params.dataPrevistaAprovacaoPedido,
        },
        naturezaIndustrializacao ? "industrializacao" : "padrao",
      ),
    );

    if (!janelaServidor.valida) {
      return { ok: false, motivo: "sem_janela_produtiva", detalhe: janelaServidor };
    }

    // Base congelada recarregada do zero (mesmo princípio de
    // carregarBasePrevisaoComercial.ts) - janelaInicioGrade usa a mesma
    // convenção de usePrevisaoComercialCapacidade.ts (dataPrevistaAprovacaoPedido).
    const base = await executarEtapa("carregar-base", TIMEOUT_BASE_MS, () =>
      deps.carregarBase(
        empresaId,
        params.projetoId,
        params.dataNecessidade,
        params.dataPrevistaAprovacaoPedido,
        janelaServidor.dataDisponibilidadeProducao,
        janelaServidor.prazoInterno,
      ),
    );

    // disponibilidadeOriginal = janelaServidor.dataDisponibilidadeProducao
    // diretamente (já resolvida corretamente por natureza) -
    // naturezaIndustrializacao continua necessária aqui só para a OUTRA
    // decisão de montarCenarioParaPrevisao: nunca confiar em negociação
    // de material enviada pelo cliente para esta natureza.
    const disponibilidadeOriginal = janelaServidor.dataDisponibilidadeProducao;

    const cenario = montarCenarioParaPrevisao(params, disponibilidadeOriginal, naturezaIndustrializacao);

    // Puro e síncrono - a MESMA função que a tela usa para exibir a
    // previsão, mas rodando aqui sobre a base recarregada no servidor.
    const saidaRecalculada = montarPrevisaoComercialProjeto(base, cenario);

    // Divergência (mesmo princípio de compararResultadosSimulacao.ts) -
    // bloqueia ANTES de qualquer chamada à RPC, nunca aprova "no escuro"
    // um valor diferente do que foi mostrado ao orçamentista.
    const diferencas = compararDadosParaAprovacaoCenario(
      {
        saida: {
          status: params.statusExibido,
          primeiraEntregaPossivel: params.primeiraEntregaPossivelExibida,
          diferencaEmDias: params.diferencaEmDiasExibida,
          custoAdicional: params.custoAdicionalExibido,
        },
        custoTecnicoAtual: params.custoTecnicoAtualExibido,
      },
      { saida: saidaRecalculada, custoTecnicoAtual: valoresOrcamento.custoTecnicoAtual },
    );

    if (diferencas.length > 0) {
      return { ok: false, motivo: "divergente", diferencas };
    }

    if (saidaRecalculada.status !== "calculado" || saidaRecalculada.primeiraEntregaPossivel === null) {
      console.error(
        `orquestrarAprovacaoCenarioComercial: previsão sem prazo calculável (status=${saidaRecalculada.status}, horizonteTecnico=${saidaRecalculada.horizonteTecnico}) - diagnósticos: ${diagnosticosParaLog(saidaRecalculada.diagnosticos)}`,
      );
      return { ok: false, motivo: "sem_prazo_calculavel" };
    }

    if (saidaRecalculada.custoAdicional === null) {
      console.error("orquestrarAprovacaoCenarioComercial: custoAdicional não calculável apesar de status=calculado.");
      return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO };
    }

    const custoAdicionalPorCategoria = {
      negociacaoMaterial: saidaRecalculada.custoAdicional.negociacaoMaterial,
      horaAdicional: saidaRecalculada.custoAdicional.horaAdicional,
      recursoTemporario: saidaRecalculada.custoAdicional.recursoTemporario,
      // Terceirização ainda não é coberta pelo motor novo (ver
      // necessidadeCapacidadeFlexivel.ts) - sempre 0 nesta fase.
      terceirizacao: 0,
    };

    const snapshot = construirSnapshotCenarioComercial({
      empresaId,
      projetoId: params.projetoId,
      tipoCenario: params.tipoCenario,
      premissas: {
        dataNecessidade: params.dataNecessidade,
        margemSegurancaDias: params.margemSegurancaDias,
        dataPrevistaAprovacaoPedido: params.dataPrevistaAprovacaoPedido,
      },
      disponibilidadeMaterial: {
        original: disponibilidadeOriginal,
        negociada: params.tipoCenario === "ajustado" && !naturezaIndustrializacao ? params.disponibilidadeMaterialNegociada : null,
      },
      decisoesCapacidade: {
        capacidadeExtraAutorizada: cenario.capacidadeExtraAutorizada,
        temporariosPorPrioridade: cenario.temporariosPorPrioridade,
        contratacoes: cenario.contratacoes,
        contratacaoNegociacaoMaterial: cenario.contratacaoNegociacaoMaterial,
      },
      saidaPrevisaoComercial: saidaRecalculada,
      custoTecnicoAtual: valoresOrcamento.custoTecnicoAtual,
      custoAdicionalPorCategoria,
      valorComercialAtualReferencia: valoresOrcamento.valorComercialAtualReferencia,
    });

    // Assinatura técnica: MESMA janela produtiva gravada no snapshot
    // (disponibilidadeOriginal = disponibilidadeMaterial.original;
    // saidaRecalculada.primeiraEntregaPossivel = saidaPrevisaoComercial.
    // primeiraEntregaPossivel) - nunca [dataSolicitadaCliente,
    // prazoProposto] (a entrega pode legitimamente ser ANTES da data
    // solicitada). Calculada com o client de sessão, ANTES de
    // deps.persistir criar (na implementação real) o client
    // privilegiado - custo/snapshot/assinatura vêm todos desta mesma
    // chamada, nenhum recomputado depois com dado potencialmente
    // diferente.
    // Extraído para uma const própria: narrowing de saidaRecalculada.
    // primeiraEntregaPossivel (!== null, já checado acima) não sobrevive
    // dentro do closure abaixo se acessado como propriedade diretamente.
    const primeiraEntregaPossivel: string = saidaRecalculada.primeiraEntregaPossivel;

    const assinaturaTecnica = await executarEtapa("calcular-assinatura-tecnica", TIMEOUT_ASSINATURA_TECNICA_MS, () =>
      deps.calcularAssinaturaTecnica(empresaId, params.projetoId, disponibilidadeOriginal, primeiraEntregaPossivel),
    );

    // Hash de TUDO que será persistido (calcularHashSolicitacaoAprovacaoCenario.ts)
    // - junto com params.chaveIdempotencia (gerada no cliente quando o
    // modal de confirmação abriu), permite à RPC distinguir uma
    // repetição legítima (mesma chave, mesmo hash - devolve o cenário
    // já gravado) de reuso indevido da chave (rejeitado como erro de
    // integridade). Calculado sobre os MESMOS valores que vão para
    // `persistir` logo abaixo - nunca uma segunda leitura.
    const hashSolicitacao = calcularHashSolicitacaoAprovacaoCenario({
      empresaId,
      aprovadoPor: userId,
      projetoId: params.projetoId,
      tipoCenario: params.tipoCenario,
      dataSolicitadaCliente: saidaRecalculada.dataSolicitadaCliente,
      prazoProposto: primeiraEntregaPossivel,
      custoTecnicoAtual: valoresOrcamento.custoTecnicoAtual,
      custoAdicionalPorCategoria,
      valorComercialAtualReferencia: valoresOrcamento.valorComercialAtualReferencia,
      assinaturaTecnica,
      snapshot,
      motivoSubstituicao: params.motivoSubstituicao,
    });

    // A partir daqui, NENHUMA etapa tem timeout - a chamada a persistir
    // pode iniciar a gravação de verdade; a resposta (sucesso, erro
    // limpo, ou falha ambígua de rede) é sempre aguardada até o fim.
    const resultadoPersistencia = await deps.persistir({
      empresaId,
      aprovadoPor: userId,
      projetoId: params.projetoId,
      tipoCenario: params.tipoCenario,
      dataSolicitadaCliente: saidaRecalculada.dataSolicitadaCliente,
      prazoProposto: primeiraEntregaPossivel,
      custoTecnicoAtual: valoresOrcamento.custoTecnicoAtual,
      custoAdicionalPorCategoria,
      valorComercialAtualReferencia: valoresOrcamento.valorComercialAtualReferencia,
      snapshot,
      assinaturaTecnica,
      chaveIdempotencia: params.chaveIdempotencia,
      hashSolicitacao,
      motivoSubstituicao: params.motivoSubstituicao,
    });

    if (resultadoPersistencia.gravacaoIncerta) {
      // A chamada de rede em si falhou - nunca houve uma resposta limpa
      // da RPC. Nunca decide sozinho aqui se gravou ou não - o cliente
      // precisa consultar antes de agir (ver ResumoFinanceiroCard.tsx).
      console.error(
        `orquestrarAprovacaoCenarioComercial: gravação incerta (falha de rede na chamada à RPC) - ${resultadoPersistencia.erro}`,
      );
      return { ok: false, motivo: "gravacao_incerta" };
    }

    if (resultadoPersistencia.erro) {
      // Detalhe técnico (mensagem da RPC, ex.: "Só administradores podem
      // aprovar...") vai só para o log do servidor - mesma disciplina de
      // orquestrarAprovacaoAutoritativa.ts, nunca repassado ao usuário
      // sem passar por uma mensagem genérica.
      console.error(`orquestrarAprovacaoCenarioComercial: erro ao persistir - ${resultadoPersistencia.erro}`);
      return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO };
    }

    return { ok: true, cenarioComercialAprovadoId: resultadoPersistencia.cenarioComercialAprovadoId as string };
  } catch (erroCapturado) {
    const duracaoMs = etapaAtual !== null ? Date.now() - inicioEtapaMs : null;

    if (erroCapturado instanceof TimeoutEtapaError) {
      console.error(
        `orquestrarAprovacaoCenarioComercial: tempo esgotado na etapa "${erroCapturado.etapa}" (${duracaoMs}ms) - nada foi gravado.`,
      );
      return { ok: false, motivo: "tempo_esgotado", etapa: erroCapturado.etapa };
    }

    // etapaAtual não-nulo aqui = a exceção aconteceu DENTRO de uma etapa
    // rastreada (não foi timeout, mas também não foi um erro genérico
    // fora de qualquer etapa conhecida) - atribui e devolve a etapa/
    // duração para diagnóstico, nunca só "erro" sem contexto nenhum.
    if (etapaAtual !== null) {
      const mensagemTecnica = erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado);
      console.error(
        `orquestrarAprovacaoCenarioComercial: falha na etapa "${etapaAtual}" (${duracaoMs}ms) - nada foi gravado - ${mensagemTecnica}`,
      );
      return { ok: false, motivo: "falha_etapa", etapa: etapaAtual, duracaoMs: duracaoMs ?? 0 };
    }

    console.error(
      `orquestrarAprovacaoCenarioComercial: erro inesperado (fora de qualquer etapa rastreada) - ${erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)}`,
    );
    return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO };
  }
}
