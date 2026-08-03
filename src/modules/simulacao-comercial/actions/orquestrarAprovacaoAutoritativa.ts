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
import type { PayloadAprovacao } from "./validarPayloadAprovacao";
import { createHash } from "crypto";

export const MENSAGEM_ERRO_GENERICA =
  "Não foi possível concluir a aprovação. Tente novamente ou execute uma nova simulação.";

export type ResultadoAprovacaoAction =
  | { ok: true; simulacaoComercialId: string }
  | { ok: false; motivo: "nao_autenticado" }
  | { ok: false; motivo: "divergente"; diferencas: DiferencaSimulacao[] }
  | { ok: false; motivo: "sem_janela_produtiva"; detalhe: JanelaComercialInvalida }
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
  itens: ItemSimulacaoOperacao[];
  chaveIdempotencia: string;
  hashSolicitacao: string;
}

export interface ResultadoPersistencia {
  simulacaoComercialId: string | null;
  /** Mensagem TÉCNICA (ex.: error.message do Supabase) - nunca repassada ao usuário; só para console.error no orquestrador. */
  erro: string | null;
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
  /** Reexecução autoritativa do núcleo do Motor, sobre a janela recalculada no servidor (nunca a do cliente). */
  executarMotor: (
    empresaId: string,
    projetoId: string,
    janelaInicio: string,
    janelaFim: string,
  ) => Promise<ResultadoSimulacao>;
  /** Chamada à RPC de persistência (client privilegiado) - só é invocada quando não há NENHUMA divergência. */
  persistir: (params: ParametrosPersistencia) => Promise<ResultadoPersistencia>;
}

// Hash canonico do que sera de fato persistido - projeto, aprovador,
// parametros comerciais (incluindo as premissas da Entrega 1) e os
// ITENS/JANELA RECALCULADOS NO SERVIDOR (nunca os do payload do
// cliente). Itens ordenados por bomOperacaoId para o hash nao depender
// da ordem de retorno.
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

    // Reexecução autoritativa: mesmo núcleo do preview, agora rodando
    // no servidor, contra o estado corrente do banco, e sobre a janela
    // recalculada no servidor (nunca a do cliente).
    const revalidacaoServidor = await deps.executarMotor(
      empresaId,
      params.projetoId,
      janelaServidor.janelaInicio,
      janelaServidor.janelaFim,
    );

    const comparacaoItens = compararResultadosSimulacao(params.resultado, revalidacaoServidor);
    const diferencas = [...diferencasJanela, ...comparacaoItens.diferencas];

    if (diferencas.length > 0) {
      // Qualquer divergência (janela OU itens) bloqueia ANTES de
      // qualquer chamada ao client privilegiado/RPC - nenhuma
      // persistência é tentada.
      return { ok: false, motivo: "divergente", diferencas };
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
