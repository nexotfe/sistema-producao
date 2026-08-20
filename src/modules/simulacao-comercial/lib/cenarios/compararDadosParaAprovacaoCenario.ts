// DEC-007 §6.2/Fase 8b (aprovação do cenário comercial) - a Server
// Action recalcula a previsão comercial no servidor (contrato de
// segurança confirmado com o usuário: é ela, nunca a RPC SQL, que
// verifica prazo/horas/custo, porque o motor só existe em TypeScript).
// Esta comparação decide se o que o navegador está pedindo para aprovar
// é IDÊNTICO ao que o servidor acabou de recalcular - qualquer
// divergência bloqueia a aprovação ANTES de chamar a RPC, mesmo função/
// mesmo princípio de compararResultadosSimulacao.ts (motor antigo).
import { numerosIguais } from "../constantesNumericas";
import type { SaidaPrevisaoComercial } from "./montarPrevisaoComercialProjeto";

/** Só os campos de SaidaPrevisaoComercial que esta comparação realmente usa - o payload da Server Action nunca precisa carregar o objeto inteiro (diagnosticos/recursosQueDeterminamTermino/etc. não entram na decisão de aprovar). */
export type CamposComparaveisSaidaPrevisaoComercial = Pick<
  SaidaPrevisaoComercial,
  "status" | "primeiraEntregaPossivel" | "diferencaEmDias" | "custoAdicional"
>;

export interface DadosParaAprovacaoCenario {
  readonly saida: CamposComparaveisSaidaPrevisaoComercial;
  /** "Valor atual do orçamento" = custo técnico, sem margem/imposto - fora de SaidaPrevisaoComercial, comparado à parte. */
  readonly custoTecnicoAtual: number;
}

export interface DivergenciaAprovacaoCenario {
  readonly campo: string;
  readonly valorExibido: unknown;
  readonly valorRecalculado: unknown;
}

function compararCustoAdicional(
  exibido: SaidaPrevisaoComercial["custoAdicional"],
  recalculado: SaidaPrevisaoComercial["custoAdicional"],
): DivergenciaAprovacaoCenario[] {
  if (exibido === null && recalculado === null) return [];
  if (exibido === null || recalculado === null) {
    return [{ campo: "custoAdicional", valorExibido: exibido, valorRecalculado: recalculado }];
  }

  const diferencas: DivergenciaAprovacaoCenario[] = [];
  const campos: (keyof NonNullable<SaidaPrevisaoComercial["custoAdicional"]>)[] = [
    "negociacaoMaterial",
    "horaAdicional",
    "recursoTemporario",
    "total",
  ];
  for (const campo of campos) {
    if (!numerosIguais(exibido[campo], recalculado[campo])) {
      diferencas.push({ campo: `custoAdicional.${campo}`, valorExibido: exibido[campo], valorRecalculado: recalculado[campo] });
    }
  }
  return diferencas;
}

/**
 * Compara o que o navegador está pedindo para aprovar (`exibido`) com o
 * que a Server Action acabou de recalcular do zero (`recalculado`).
 * Lista vazia = idêntico, aprovação pode prosseguir. Qualquer divergência
 * (mesmo em 1 campo) bloqueia - nunca aprova "no escuro" com um número
 * diferente do que foi mostrado ao orçamentista.
 */
export function compararDadosParaAprovacaoCenario(
  exibido: DadosParaAprovacaoCenario,
  recalculado: DadosParaAprovacaoCenario,
): DivergenciaAprovacaoCenario[] {
  const diferencas: DivergenciaAprovacaoCenario[] = [];

  if (exibido.saida.status !== recalculado.saida.status) {
    diferencas.push({ campo: "status", valorExibido: exibido.saida.status, valorRecalculado: recalculado.saida.status });
  }
  if (exibido.saida.primeiraEntregaPossivel !== recalculado.saida.primeiraEntregaPossivel) {
    diferencas.push({
      campo: "primeiraEntregaPossivel",
      valorExibido: exibido.saida.primeiraEntregaPossivel,
      valorRecalculado: recalculado.saida.primeiraEntregaPossivel,
    });
  }
  if (exibido.saida.diferencaEmDias !== recalculado.saida.diferencaEmDias) {
    diferencas.push({
      campo: "diferencaEmDias",
      valorExibido: exibido.saida.diferencaEmDias,
      valorRecalculado: recalculado.saida.diferencaEmDias,
    });
  }
  diferencas.push(...compararCustoAdicional(exibido.saida.custoAdicional, recalculado.saida.custoAdicional));

  if (!numerosIguais(exibido.custoTecnicoAtual, recalculado.custoTecnicoAtual)) {
    diferencas.push({
      campo: "custoTecnicoAtual",
      valorExibido: exibido.custoTecnicoAtual,
      valorRecalculado: recalculado.custoTecnicoAtual,
    });
  }

  return diferencas;
}
