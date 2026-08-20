// DEC-007 - previsão comercial por capacidade, Etapa 1 (pura).
//
// Agregação SEGURA dos vencedores (já resolvidos por
// selecionarFonteVencedora.ts) em CompromissoCapacidade - a chave inclui
// classeFila/prioridade/dataEntradaFila/disponivelAPartirDe além de
// (empresaId,projetoId,recursoId): dois blocos do mesmo projeto/recurso
// com disponibilidade diferente (ex.: parte já disponível, outra parte
// só disponível mais adiante) NUNCA são somados - a fila FIFO (próxima
// etapa) precisa preservar os segmentos separados, senão horas que só
// estarão disponíveis no futuro seriam antecipadas pela agregação.
import type { CompromissoCapacidade, CompromissoGranular, OrigemCompromissoAgregado } from "./compromissoCapacidade";
import { validarDataIso, validarHorasFinitasPositivas } from "./validacoes";

/**
 * Defesa em profundidade (mesma disciplina de alocarOperacaoDiaAdia.ts):
 * esta função é pura e pode ser chamada isoladamente em teste, sem
 * passar por selecionarFonteVencedora antes - nunca confia que o
 * chamador já validou. Duplicata de (origem,chaveTrabalho) aqui teria o
 * mesmo efeito de somar a mesma carga duas vezes dentro do bloco.
 */
function validarEntrada(vencedores: readonly CompromissoGranular[]): void {
  const vistos = new Set<string>();
  for (const g of vencedores) {
    validarHorasFinitasPositivas(
      g.horasRestantesPadrao,
      `horasRestantesPadrao (chaveTrabalho="${g.chaveTrabalho}", projetoId="${g.projetoId}", recursoId="${g.recursoId}")`,
    );
    validarDataIso(g.disponivelAPartirDe, `disponivelAPartirDe (chaveTrabalho="${g.chaveTrabalho}")`);
    if (g.dataEntradaFila !== null) {
      validarDataIso(g.dataEntradaFila, `dataEntradaFila (chaveTrabalho="${g.chaveTrabalho}")`);
    }

    // empresaId entra na chave porque chaveTrabalho nunca é globalmente
    // única entre empresas (ver mesma nota em selecionarFonteVencedora.ts).
    const chave = `${g.empresaId}::${g.origem}::${g.chaveTrabalho}`;
    if (vistos.has(chave)) {
      throw new RangeError(
        `vencedores contém chaveTrabalho="${g.chaveTrabalho}" duplicada para (empresaId="${g.empresaId}", origem="${g.origem}") - somaria a mesma carga duas vezes no bloco agregado.`,
      );
    }
    vistos.add(chave);
  }
}

function chaveAgregacao(g: CompromissoGranular): string {
  return [
    g.empresaId,
    g.projetoId,
    g.recursoId,
    g.classeFila,
    String(g.prioridade),
    g.dataEntradaFila ?? "∅",
    g.disponivelAPartirDe,
  ].join("::");
}

export function agregarCompromissosPorRecurso(vencedores: readonly CompromissoGranular[]): CompromissoCapacidade[] {
  validarEntrada(vencedores);

  const blocosPorChave = new Map<string, CompromissoGranular[]>();

  for (const g of vencedores) {
    const chave = chaveAgregacao(g);
    const lista = blocosPorChave.get(chave);
    if (lista) {
      lista.push(g);
    } else {
      blocosPorChave.set(chave, [g]);
    }
  }

  const resultado: CompromissoCapacidade[] = [];

  for (const [chaveOrdenacao, bloco] of blocosPorChave) {
    const primeiro = bloco[0];
    const horasRestantesPadrao = bloco.reduce((soma, g) => soma + g.horasRestantesPadrao, 0);
    const origensDistintas = new Set(bloco.map((g) => g.origem));
    const origem: OrigemCompromissoAgregado = origensDistintas.size === 1 ? primeiro.origem : "misto";

    resultado.push({
      empresaId: primeiro.empresaId,
      projetoId: primeiro.projetoId,
      recursoId: primeiro.recursoId,
      horasRestantesPadrao,
      disponivelAPartirDe: primeiro.disponivelAPartirDe,
      dataEntradaFila: primeiro.dataEntradaFila,
      prioridade: primeiro.prioridade,
      classeFila: primeiro.classeFila,
      chaveOrdenacao,
      origem,
      chavesTrabalhoOrigem: Object.freeze(bloco.map((g) => g.chaveTrabalho)),
    });
  }

  return resultado;
}
