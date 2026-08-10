// Orquestrador da aprovação autoritativa (PAD-008, seções 7-8;
// Entrega 1 do PAD-008 v2.0, seção 17), extraído de
// aprovarSimulacaoComercialAction.ts para ter uma fronteira testável
// com dependências injetadas (correção da auditoria da Entrega 1,
// ponto 5) - sem isso, testar esta lógica exigiria uma sessão real do
// Supabase.
//
// SEM "use server": este arquivo não é uma Server Action - é chamado
// por uma (aprovarSimulacaoComercialAction.ts), que monta as
// dependências reais (clients Supabase de sessão e privilegiado) e as
// injeta aqui. Next.js só permite Server Actions ("use server")
// exportarem funções assíncronas; um objeto de dependências ou uma
// constante de mensagem, exportados daqui, quebrariam essa regra se
// estivessem no arquivo "use server".
//
// Correção da auditoria, ponto 4: nenhuma mensagem de erro devolvida
// ao chamador contém detalhe técnico (nem de exceção capturada, nem de
// `error.message` de chamada ao Supabase) - o detalhe vai só para
// console.error no servidor; o retorno usa sempre MENSAGEM_ERRO_GENERICA.
import { compararResultadosSimulacao, type DiferencaSimulacao } from "../lib/compararResultadosSimulacao";
import {
  compararJanelaEfetiva,
  type JanelaComercialInvalida,
  type PremissasJanelaComercial,
  type ResultadoJanelaComercial,
} from "../lib/prepararJanelaComercial";
import type { ResultadoSimulacao, ItemSimulacaoOperacao } from "../lib/executarSimulacao";
import type { ResultadoEstimativaInicioNecessario } from "../lib/estimarInicioNecessario";
import type { EstimativaPersistivelV5 } from "../lib/montarPayloadV5";
import type { BaseFixaMotor } from "../lib/prepararEntradasMotor";
import type { ContextoCalendario } from "@/modules/calendario/lib/contextoCalendario";
import { EstruturaFabricacaoIncompletaError } from "../lib/errors";
import { SubconjuntoSemBomError } from "@/modules/bom/lib/errors";
import type { PayloadAprovacao } from "./validarPayloadAprovacao";
import { createHash } from "crypto";

export const MENSAGEM_ERRO_GENERICA =
  "Não foi possível concluir a aprovação. Tente novamente ou execute uma nova simulação.";

export type ResultadoAprovacaoAction =
  | { ok: true; simulacaoComercialId: string }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "divergente"; diferencas: DiferencaSimulacao[] }
  | { ok: false; motivo: "sem_janela_produtiva"; detalhe: JanelaComercialInvalida }
  | { ok: false; motivo: "estrutura_fabricacao_incompleta"; mensagem: string }
  // DEC-006: dados_insuficientes/horizonte_tecnico_excedido são sempre
  // impeditivos, mesmo que o preview do cliente tenha mostrado outro
  // resultado - nunca persistem com os 4 campos de estimativa nulos
  // nem caem para o comportamento v4 sem estimativa.
  | {
      ok: false;
      motivo: "estimativa_bloqueada";
      detalhe: Extract<
        ResultadoEstimativaInicioNecessario,
        { estado: "dados_insuficientes" | "horizonte_tecnico_excedido" }
      >;
    }
  // DEC-006 §2 (correção): janela_insuficiente exige confirmação
  // explícita do usuário, EXIGIDA E VERIFICADA NO SERVIDOR - nunca
  // inferida só pelo gate client-side. Payload sem essa confirmação
  // para aqui, antes do hash/RPC.
  | {
      ok: false;
      motivo: "confirmacao_necessaria";
      detalhe: Extract<ResultadoEstimativaInicioNecessario, { estado: "janela_insuficiente" }>;
    }
  | { ok: false; motivo: "erro"; mensagem: string };

export interface ParametrosPersistencia {
  aprovadoPor: string;
  projetoId: string;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  dataPrevistaAprovacaoPedido: string;
  dataChegadaPrevista: string;
  janelaInicio: string;
  janelaFim: string;
  /** Fase 2: estimativa já recalculada de forma autoritativa - restrita, por tipo, aos 3 estados que a RPC v5 aceita (ver montarPayloadV5.ts). */
  estimativa: EstimativaPersistivelV5;
  itens: ItemSimulacaoOperacao[];
  chaveIdempotencia: string;
  hashSolicitacao: string;
}

export interface ResultadoPersistencia {
  simulacaoComercialId: string | null;
  /** Mensagem TÉCNICA (ex.: error.message do Supabase) - nunca repassada ao usuário; só para console.error no orquestrador. */
  erro: string | null;
}

/**
 * DEC-006 (correção): base fixa (roteiro/recursos/comprometido) e
 * contexto de calendário, preparados UMA ÚNICA VEZ e compartilhados
 * entre `executarMotor` e `estimarInicioNecessario` - as duas consultas
 * nunca são feitas separadamente, o que poderia combinar resultados
 * obtidos em momentos diferentes (ex.: comprometido mudando entre uma
 * consulta e outra). Mesmo padrão já usado no preview do cliente
 * (`SimulacaoCapacidade.tsx`).
 */
export interface BaseAutoritativaSimulacao {
  baseFixa: BaseFixaMotor;
  contexto: ContextoCalendario;
  /** Sequência de dias produtivos em [floorDate, prazoInterno] - insumo da busca binária do Calculador Reverso. */
  P: string[];
  diasCivisExaminados: number;
}

export interface DependenciasAprovacaoAutoritativa {
  /** Resolve o usuário autenticado a partir da sessão do servidor (auth.getUser(), nunca getSession()). null = não autenticado. */
  autenticar: () => Promise<string | null>;
  /** Resolve empresa_id do usuário autenticado. null = não encontrado. */
  buscarEmpresaId: (userId: string) => Promise<string | null>;
  /** PAD-008 v2.0 §17 - recalcula a janela comercial a partir das premissas, contra o Calendário Operacional corrente. */
  prepararJanela: (
    empresaId: string,
    premissas: PremissasJanelaComercial,
  ) => Promise<ResultadoJanelaComercial>;
  /**
   * DEC-006 (correção): prepara UMA VEZ a base fixa e o contexto de
   * calendário usados tanto pelo Motor quanto pelo Calculador Reverso.
   * `prazoInterno` vem da `janelaServidor` já recalculada por
   * `prepararJanela`.
   */
  prepararBaseAutoritativa: (
    empresaId: string,
    projetoId: string,
    prazoInterno: string,
  ) => Promise<BaseAutoritativaSimulacao>;
  /** Reexecução autoritativa do núcleo do Motor, sobre a base já preparada e a janela recalculada no servidor (nunca a do cliente). */
  executarMotor: (
    empresaId: string,
    base: BaseAutoritativaSimulacao,
    janelaInicio: string,
    janelaFim: string,
  ) => Promise<ResultadoSimulacao>;
  /** Chamada à RPC de persistência (client privilegiado) - só é invocada quando não há NENHUMA divergência. */
  persistir: (params: ParametrosPersistencia) => Promise<ResultadoPersistencia>;
  /**
   * DEC-006 - recálculo autoritativo do Calculador Reverso, sempre no
   * servidor, sobre a base já preparada e a janela recalculada (nunca a
   * do cliente, nunca um campo de estimativa vindo do payload - o
   * payload de hoje nem carrega isso). `prazoInterno`/
   * `dataDisponibilidadeProducao` vêm da mesma `janelaServidor`.
   */
  estimarInicioNecessario: (
    empresaId: string,
    base: BaseAutoritativaSimulacao,
    prazoInterno: string,
    dataDisponibilidadeProducao: string,
  ) => Promise<ResultadoEstimativaInicioNecessario>;
}

// Hash canonico do que sera de fato persistido - projeto, aprovador,
// parametros comerciais (incluindo as premissas da Entrega 1), os
// ITENS/JANELA RECALCULADOS NO SERVIDOR (nunca os do payload do
// cliente) e, desde DEC-006, os 4 campos do Calculador Reverso
// (tambem sempre recalculados no servidor - nenhum campo de
// estimativa vindo do cliente e' confiavel). Itens ordenados por
// bomOperacaoId para o hash nao depender da ordem de retorno.
//
// Calculado SOMENTE depois do recalculo autoritativo do Calculador
// Reverso (DEC-006 §4) - nunca antes, para nao permitir que duas
// solicitacoes com a mesma chave de idempotencia mas estimativas
// diferentes colidam silenciosamente via ON CONFLICT DO NOTHING.
function calcularHashSolicitacao(dados: {
  projetoId: string;
  aprovadoPor: string;
  cenarioDemanda: string;
  modoProducao: string;
  dataNecessidade: string;
  margemSegurancaDias: number;
  dataPrevistaAprovacaoPedido: string;
  dataChegadaPrevista: string;
  janelaInicio: string;
  janelaFim: string;
  itens: ItemSimulacaoOperacao[];
  estimativaInicioNecessario: string;
  estimativaEstado: string;
  estimativaMetodoVersao: number;
  folgaDiasProdutivos: number;
}): string {
  // Distribuições ordenadas por recursoId (chave única dentro da
  // operação) - o hash não pode depender da ordem em que o núcleo
  // decidiu processar os candidatos, só do conteúdo.
  const itensOrdenados = [...dados.itens]
    .sort((a, b) => a.bomOperacaoId.localeCompare(b.bomOperacaoId))
    .map((item) => ({
      bomOperacaoId: item.bomOperacaoId,
      recursoOriginalId: item.recursoOriginalId,
      necessario: item.necessario,
      deficit: item.deficit,
      distribuicoes: [...item.distribuicoes]
        .sort((a, b) => a.recursoId.localeCompare(b.recursoId))
        .map((distribuicao) => ({
          recursoId: distribuicao.recursoId,
          origem: distribuicao.origem,
          ordemConsideracao: distribuicao.ordemConsideracao,
          capacidadeBrutaPeriodo: distribuicao.capacidadeBrutaPeriodo,
          produtividadeConsiderada: distribuicao.produtividadeConsiderada,
          capacidadeEfetiva: distribuicao.capacidadeEfetiva,
          comprometidoInicial: distribuicao.comprometidoInicial,
          capacidadeDisponivelInicial: distribuicao.capacidadeDisponivelInicial,
          capacidadeDisponivelAntes: distribuicao.capacidadeDisponivelAntes,
          horasPadraoAlocadas: distribuicao.horasPadraoAlocadas,
          horasMaquinaEstimadas: distribuicao.horasMaquinaEstimadas,
          capacidadeDisponivelDepois: distribuicao.capacidadeDisponivelDepois,
        })),
    }));

  const canonico = JSON.stringify({
    projetoId: dados.projetoId,
    aprovadoPor: dados.aprovadoPor,
    cenarioDemanda: dados.cenarioDemanda,
    modoProducao: dados.modoProducao,
    dataNecessidade: dados.dataNecessidade,
    margemSegurancaDias: dados.margemSegurancaDias,
    dataPrevistaAprovacaoPedido: dados.dataPrevistaAprovacaoPedido,
    dataChegadaPrevista: dados.dataChegadaPrevista,
    janelaInicio: dados.janelaInicio,
    janelaFim: dados.janelaFim,
    itens: itensOrdenados,
    estimativaInicioNecessario: dados.estimativaInicioNecessario,
    estimativaEstado: dados.estimativaEstado,
    estimativaMetodoVersao: dados.estimativaMetodoVersao,
    folgaDiasProdutivos: dados.folgaDiasProdutivos,
  });

  return createHash("sha256").update(canonico).digest("hex");
}

/**
 * Orquestra a aprovação autoritativa: autentica, recalcula a janela
 * comercial e o resultado do Motor no servidor, compara com o que o
 * cliente enviou (janela + itens), e só persiste quando idêntico.
 *
 * `params` já deve ter passado por validarPayloadAprovacao - este
 * orquestrador não revalida forma de payload, só a substância
 * (autenticação, janela, itens).
 */
export async function orquestrarAprovacaoAutoritativa(
  params: PayloadAprovacao,
  deps: DependenciasAprovacaoAutoritativa,
): Promise<ResultadoAprovacaoAction> {
  try {
    const userId = await deps.autenticar();

    if (!userId) {
      return { ok: false, motivo: "nao_autenticado" };
    }

    const empresaId = await deps.buscarEmpresaId(userId);

    if (!empresaId) {
      console.error(
        `orquestrarAprovacaoAutoritativa: empresa não encontrada para o usuário ${userId}`,
      );
      return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA };
    }

    // Camada de preparação comercial (PAD-008 v2.0 §17), recalculada no
    // servidor - nunca confia na janela que o cliente enviou. Se não
    // existir janela produtiva viável, a aprovação para aqui: não há
    // resultado de capacidade válido para revalidar nem persistir.
    const janelaServidor = await deps.prepararJanela(empresaId, {
      dataNecessidade: params.dataNecessidade,
      margemSegurancaDiasProdutivos: params.margemSegurancaDias,
      dataPrevistaAprovacaoPedido: params.dataPrevistaAprovacaoPedido,
    });

    if (!janelaServidor.valida) {
      return { ok: false, motivo: "sem_janela_produtiva", detalhe: janelaServidor };
    }

    // Compara a janela que o cliente enviou (calculada na última
    // revalidação dele) com a que o servidor acabou de recalcular -
    // ANTES de chamar o Motor ou a RPC. Uma janela adulterada ou
    // desatualizada (ex.: calendário mudou nesse meio-tempo) é
    // detectada aqui.
    const diferencasJanela = compararJanelaEfetiva(
      { janelaInicio: params.janelaInicio, janelaFim: params.janelaFim },
      { janelaInicio: janelaServidor.janelaInicio, janelaFim: janelaServidor.janelaFim },
    );

    // DEC-006 (correção): base fixa e contexto de calendário preparados
    // UMA ÚNICA VEZ aqui, compartilhados entre Motor e Calculador
    // Reverso logo abaixo - nunca duas preparações separadas, que
    // poderiam combinar dados obtidos em momentos diferentes.
    //
    // Try/catch cobre também esta preparação (não só executarMotor):
    // é aqui, ao montar a base fixa (coletarEstruturaBom), que
    // EstruturaFabricacaoIncompletaError/SubconjuntoSemBomError podem
    // de fato ser lançados - precisam do motivo autoritativo PRÓPRIO
    // (estrutura_fabricacao_incompleta), nunca cair no catch genérico
    // externo (motivo "erro"). O `return` abaixo garante que
    // `deps.persistir` nunca é alcançado nesse caso.
    let baseAutoritativa: BaseAutoritativaSimulacao;
    let revalidacaoServidor: ResultadoSimulacao;
    try {
      baseAutoritativa = await deps.prepararBaseAutoritativa(
        empresaId,
        params.projetoId,
        janelaServidor.prazoInterno,
      );

      // Reexecução autoritativa: mesmo núcleo do preview, agora rodando
      // no servidor, contra o estado corrente do banco, sobre a base já
      // preparada e a janela recalculada no servidor (nunca a do
      // cliente).
      revalidacaoServidor = await deps.executarMotor(
        empresaId,
        baseAutoritativa,
        janelaServidor.janelaInicio,
        janelaServidor.janelaFim,
      );
    } catch (erroEstrutura) {
      if (
        erroEstrutura instanceof EstruturaFabricacaoIncompletaError ||
        erroEstrutura instanceof SubconjuntoSemBomError
      ) {
        return {
          ok: false,
          motivo: "estrutura_fabricacao_incompleta",
          mensagem: erroEstrutura.message,
        };
      }
      throw erroEstrutura;
    }

    const comparacaoItens = compararResultadosSimulacao(params.resultado, revalidacaoServidor);
    const diferencas = [...diferencasJanela, ...comparacaoItens.diferencas];

    if (diferencas.length > 0) {
      // Qualquer divergência (janela OU itens) bloqueia ANTES de
      // qualquer chamada ao client privilegiado/RPC - nenhuma
      // persistência é tentada.
      return { ok: false, motivo: "divergente", diferencas };
    }

    // DEC-006: recálculo autoritativo do Calculador Reverso, sempre no
    // servidor, sobre a MESMA base já preparada acima - nunca confia em
    // nenhum resultado de estimativa vindo do cliente (o payload de
    // hoje nem carrega isso). dados_insuficientes/horizonte_tecnico_excedido
    // são sempre impeditivos: bloqueiam aqui, ANTES do hash e de
    // qualquer persistência - nunca persistem com os 4 campos nulos,
    // nunca caem para o comportamento v4 sem estimativa.
    const resultadoEstimativa = await deps.estimarInicioNecessario(
      empresaId,
      baseAutoritativa,
      janelaServidor.prazoInterno,
      janelaServidor.dataDisponibilidadeProducao,
    );

    if (
      resultadoEstimativa.estado === "dados_insuficientes" ||
      resultadoEstimativa.estado === "horizonte_tecnico_excedido"
    ) {
      return { ok: false, motivo: "estimativa_bloqueada", detalhe: resultadoEstimativa };
    }

    // DEC-006 §2 (correção): janela_insuficiente só pode prosseguir com
    // confirmação EXPLÍCITA verificada aqui, no servidor - nunca
    // inferida só porque o cliente deixou passar (o gate client-side
    // pode estar desatualizado, ou simplesmente não existir ainda para
    // este estado). Sem o sinal, para antes do hash e de
    // `deps.persistir` - nenhuma chamada de RPC é feita.
    if (resultadoEstimativa.estado === "janela_insuficiente" && !params.confirmarJanelaInsuficiente) {
      return { ok: false, motivo: "confirmacao_necessaria", detalhe: resultadoEstimativa };
    }

    const hashSolicitacao = calcularHashSolicitacao({
      projetoId: params.projetoId,
      aprovadoPor: userId,
      cenarioDemanda: params.cenarioDemanda,
      modoProducao: params.modoProducao,
      dataNecessidade: params.dataNecessidade,
      margemSegurancaDias: params.margemSegurancaDias,
      dataPrevistaAprovacaoPedido: params.dataPrevistaAprovacaoPedido,
      dataChegadaPrevista: janelaServidor.dataChegadaPrevista,
      janelaInicio: janelaServidor.janelaInicio,
      janelaFim: janelaServidor.janelaFim,
      itens: revalidacaoServidor.itensPorOperacao,
      estimativaInicioNecessario: resultadoEstimativa.dataEstimadaInicioNecessario,
      estimativaEstado: resultadoEstimativa.estado,
      estimativaMetodoVersao: resultadoEstimativa.metodoVersao,
      folgaDiasProdutivos: resultadoEstimativa.folgaDiasProdutivos,
    });

    // A partir daqui, só o client privilegiado é usado, só para
    // persistir - e só com o resultado recalculado no servidor (itens
    // e janela), nunca com o que o cliente enviou.
    const resultadoPersistencia = await deps.persistir({
      aprovadoPor: userId,
      projetoId: params.projetoId,
      cenarioDemanda: params.cenarioDemanda,
      modoProducao: params.modoProducao,
      dataNecessidade: params.dataNecessidade,
      margemSegurancaDias: params.margemSegurancaDias,
      dataPrevistaAprovacaoPedido: params.dataPrevistaAprovacaoPedido,
      dataChegadaPrevista: janelaServidor.dataChegadaPrevista,
      janelaInicio: janelaServidor.janelaInicio,
      janelaFim: janelaServidor.janelaFim,
      // Narrowed pelos dois `return` acima (dados_insuficientes/
      // horizonte_tecnico_excedido já saíram da função) - o TypeScript
      // já enxerga resultadoEstimativa como os 3 estados persistíveis,
      // exatamente o que EstimativaPersistivelV5 exige.
      estimativa: resultadoEstimativa,
      itens: revalidacaoServidor.itensPorOperacao,
      chaveIdempotencia: params.chaveIdempotencia,
      hashSolicitacao,
    });

    if (resultadoPersistencia.erro) {
      // Correção 4: o detalhe técnico (ex.: error.message da RPC) vai
      // só para o log do servidor - nunca no retorno ao navegador.
      console.error(
        `orquestrarAprovacaoAutoritativa: erro ao persistir - ${resultadoPersistencia.erro}`,
      );
      return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA };
    }

    return { ok: true, simulacaoComercialId: resultadoPersistencia.simulacaoComercialId as string };
  } catch (erroCapturado) {
    // Correção 4: mesma regra para qualquer exceção não prevista -
    // detalhe só no log, nunca no retorno.
    console.error(
      `orquestrarAprovacaoAutoritativa: erro inesperado - ${erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)}`,
    );
    return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA };
  }
}
