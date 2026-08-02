// Orquestração do cálculo de janela comercial para exibição no preview
// (SimulacaoCapacidade.tsx) - extraída do componente para ser testável
// com dependências injetadas (correção da auditoria da Entrega 1,
// ponto 3: o efeito original podia deixar `calculandoJanela` travado em
// `true` quando as premissas ficavam inválidas enquanto um cálculo
// anterior ainda estava em voo).
import {
  ConfiguracaoCalendarioAusenteError,
  LimiteDeslocamentoDiasProdutivosExcedidoError,
} from "@/modules/calendario/lib/errors";
import type { PremissasJanelaComercial, ResultadoJanelaComercial } from "./prepararJanelaComercial";

export interface DependenciasCalculoJanela {
  /** Resolve empresa_id da sessão atual. null quando não há sessão/empresa (silencioso - o preview não é o lugar de exigir login). */
  buscarEmpresaId: () => Promise<string | null>;
  /** PAD-008 v2.0 §17 - normalmente prepararJanelaComercial(supabase, empresaId, premissas). */
  prepararJanela: (
    empresaId: string,
    premissas: PremissasJanelaComercial,
  ) => Promise<ResultadoJanelaComercial>;
}

export interface CallbacksCalculoJanela {
  setErro: (mensagem: string | null) => void;
  setJanela: (janela: ResultadoJanelaComercial | null) => void;
  setCalculando: (valor: boolean) => void;
  /** true quando um efeito mais recente já superou esta chamada - protege contra resultado assíncrono obsoleto sobrescrevendo um mais novo. */
  foiCancelado: () => boolean;
}

/** Nunca expõe detalhe técnico (mensagem de exceção crua) na interface. */
export function mensagemErroJanelaComercial(erro: unknown): string {
  if (erro instanceof LimiteDeslocamentoDiasProdutivosExcedidoError) {
    return "Não foi possível calcular a janela produtiva. Verifique se o Calendário Operacional da empresa está configurado com pelo menos um dia produtivo.";
  }
  if (erro instanceof ConfiguracaoCalendarioAusenteError) {
    return "O Calendário Operacional desta empresa ainda não foi configurado.";
  }
  return "Não foi possível calcular a janela produtiva a partir das premissas informadas.";
}

/**
 * Recalcula a janela comercial de preview a partir das premissas
 * atuais. Contrato fechado quanto ao estado "calculando":
 * `setCalculando(false)` é sempre chamado antes de retornar - tanto no
 * caminho síncrono (premissas incompletas/inválidas) quanto ao final
 * do caminho assíncrono (sucesso ou erro) - nunca fica pendurado em
 * `true`. `foiCancelado()` só protege contra uma chamada obsoleta
 * SOBRESCREVER o resultado mais novo com dado velho; não substitui a
 * limpeza do estado "calculando" da chamada atual.
 */
export async function calcularJanelaComercialParaExibicao(
  premissas: PremissasJanelaComercial,
  margemSegurancaValida: boolean,
  deps: DependenciasCalculoJanela,
  callbacks: CallbacksCalculoJanela,
): Promise<void> {
  callbacks.setErro(null);

  const premissasCompletas =
    Boolean(premissas.dataPrevistaAprovacaoPedido) &&
    Boolean(premissas.dataNecessidade) &&
    margemSegurancaValida;

  if (!premissasCompletas) {
    callbacks.setJanela(null);
    // Correção do bug original: limpa "calculando" mesmo neste ramo
    // síncrono, independentemente de uma chamada anterior (agora
    // obsoleta) ainda estar em voo - aquela chamada, quando resolver,
    // fica protegida por foiCancelado() e não vai reabrir o estado.
    callbacks.setCalculando(false);
    return;
  }

  callbacks.setCalculando(true);

  try {
    const empresaId = await deps.buscarEmpresaId();

    if (empresaId === null) {
      return;
    }

    const resultado = await deps.prepararJanela(empresaId, premissas);

    if (!callbacks.foiCancelado()) {
      callbacks.setJanela(resultado);
    }
  } catch (erroCapturado) {
    if (!callbacks.foiCancelado()) {
      callbacks.setJanela(null);
      callbacks.setErro(mensagemErroJanelaComercial(erroCapturado));
    }
  } finally {
    if (!callbacks.foiCancelado()) {
      callbacks.setCalculando(false);
    }
  }
}
