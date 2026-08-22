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

export const MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO =
  "Não foi possível concluir a aprovação do cenário comercial. Recalcule a previsão comercial e tente novamente.";

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
  try {
    const userId = await deps.autenticar();
    if (!userId) {
      return { ok: false, motivo: "nao_autenticado" };
    }

    const autorizacao = await deps.autorizarAprovador(userId);
    if (!autorizacao) {
      return { ok: false, motivo: "nao_autorizado" };
    }
    const empresaId = autorizacao.empresaId;

    // Buscado ANTES de preparar a janela (`tipoProjeto` decide
    // modoDisponibilidadeMaterial abaixo) - nunca confia em nenhum dado
    // de natureza enviado pelo cliente para essa decisão.
    const valoresOrcamento = await deps.buscarValoresOrcamentoAtual(empresaId, params.projetoId);
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
    const janelaServidor = await deps.prepararJanela(
      empresaId,
      {
        dataNecessidade: params.dataNecessidade,
        margemSegurancaDiasProdutivos: params.margemSegurancaDias,
        dataPrevistaAprovacaoPedido: params.dataPrevistaAprovacaoPedido,
      },
      naturezaIndustrializacao ? "industrializacao" : "padrao",
    );

    if (!janelaServidor.valida) {
      return { ok: false, motivo: "sem_janela_produtiva", detalhe: janelaServidor };
    }

    // Base congelada recarregada do zero (mesmo princípio de
    // carregarBasePrevisaoComercial.ts) - janelaInicioGrade usa a mesma
    // convenção de usePrevisaoComercialCapacidade.ts (dataPrevistaAprovacaoPedido).
    const base = await deps.carregarBase(
      empresaId,
      params.projetoId,
      params.dataNecessidade,
      params.dataPrevistaAprovacaoPedido,
      janelaServidor.dataDisponibilidadeProducao,
      janelaServidor.prazoInterno,
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
    const assinaturaTecnica = await deps.calcularAssinaturaTecnica(
      empresaId,
      params.projetoId,
      disponibilidadeOriginal,
      saidaRecalculada.primeiraEntregaPossivel,
    );

    const resultadoPersistencia = await deps.persistir({
      empresaId,
      aprovadoPor: userId,
      projetoId: params.projetoId,
      tipoCenario: params.tipoCenario,
      dataSolicitadaCliente: saidaRecalculada.dataSolicitadaCliente,
      prazoProposto: saidaRecalculada.primeiraEntregaPossivel,
      custoTecnicoAtual: valoresOrcamento.custoTecnicoAtual,
      custoAdicionalPorCategoria,
      valorComercialAtualReferencia: valoresOrcamento.valorComercialAtualReferencia,
      snapshot,
      assinaturaTecnica,
      motivoSubstituicao: params.motivoSubstituicao,
    });

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
    console.error(
      `orquestrarAprovacaoCenarioComercial: erro inesperado - ${erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)}`,
    );
    return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO };
  }
}
