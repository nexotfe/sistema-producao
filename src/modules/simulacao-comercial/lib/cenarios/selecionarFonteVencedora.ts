// DEC-007 - previsão comercial por capacidade, Etapa 1 (pura). Ver
// compromissoCapacidade.ts para o contrato completo.
//
// Regra de deduplicação entre snapshot_comercial e pcp_real, por
// (empresaId,projetoId,recursoId):
// - Só snapshot (sem pcp_real para o trio) -> snapshot vence integralmente.
// - Só pcp_real (sem snapshot para o trio) -> pcp_real vence integralmente,
//   nada a decidir (não há com o que conflitar).
// - Os dois presentes: granulares de pcp_real cuja chaveTrabalho bate
//   EXATAMENTE com uma chaveTrabalho do snapshot substituem essa
//   granular específica (substituição individual, sempre segura,
//   independente de declaração). O que sobra dos dois lados sem bater
//   por chave só é resolvido por uma CoberturaIntegralPcp explícita
//   para aquele trio - presente, pcp_real vence o resto e o snapshot
//   restante é descartado; ausente, o trio inteiro fica de fora da
//   agregação numérica e vira DiagnosticoGranularidadeInsuficiente
//   (nunca soma as duas fontes, nunca descarta o snapshot às cegas).
import type {
  CompromissoGranular,
  CoberturaIntegralPcp,
  DiagnosticoGranularidadeInsuficiente,
  ResultadoSelecaoFonte,
} from "./compromissoCapacidade";
import { validarDataIso, validarHorasFinitasPositivas } from "./validacoes";

function chaveTrio(empresaId: string, projetoId: string, recursoId: string): string {
  return `${empresaId}::${projetoId}::${recursoId}`;
}

function validarCompromissoGranular(g: CompromissoGranular): void {
  validarHorasFinitasPositivas(
    g.horasRestantesPadrao,
    `horasRestantesPadrao (chaveTrabalho="${g.chaveTrabalho}", projetoId="${g.projetoId}", recursoId="${g.recursoId}")`,
  );
  validarDataIso(g.disponivelAPartirDe, `disponivelAPartirDe (chaveTrabalho="${g.chaveTrabalho}")`);
  if (g.dataEntradaFila !== null) {
    validarDataIso(g.dataEntradaFila, `dataEntradaFila (chaveTrabalho="${g.chaveTrabalho}")`);
  }
  if (g.classeFila === "confirmado" && g.dataEntradaFila === null) {
    throw new RangeError(
      `CompromissoGranular com classeFila="confirmado" (chaveTrabalho="${g.chaveTrabalho}", projetoId="${g.projetoId}", recursoId="${g.recursoId}") precisa de dataEntradaFila real (transição para pedido_recebido) - nunca null. Um compromisso confirmado sem data de entrada não pode ser ordenado na fila sem inventar uma data.`,
    );
  }
}

/**
 * Rejeita (empresaId, origem, chaveTrabalho) duplicado - a mesma peça de
 * trabalho reportada duas vezes pelo MESMO carregador somaria carga
 * duas vezes na agregação (nunca um Set silencioso: é sinal de bug em
 * quem montou a lista, precisa ser visível). chaveTrabalho repetida em
 * ORIGENS diferentes é esperada (é exatamente o caso que
 * selecionarFonteVencedora resolve) - só a combinação precisa ser
 * única. empresaId entra na chave porque chaveTrabalho NUNCA é
 * globalmente única entre empresas (só dentro de uma empresa) - duas
 * empresas diferentes podem legitimamente ter o mesmo
 * "(projetoId)::(recursoId)" como chave agregada do snapshot.
 */
function validarSemDuplicata(granulares: readonly CompromissoGranular[]): void {
  const vistos = new Set<string>();
  for (const g of granulares) {
    const chave = `${g.empresaId}::${g.origem}::${g.chaveTrabalho}`;
    if (vistos.has(chave)) {
      throw new RangeError(
        `granulares contém chaveTrabalho="${g.chaveTrabalho}" duplicada para (empresaId="${g.empresaId}", origem="${g.origem}") - a mesma peça de trabalho não pode ser reportada duas vezes pelo mesmo carregador (somaria a carga em dobro na agregação).`,
      );
    }
    vistos.add(chave);
  }
}

export function selecionarFonteVencedora(params: {
  granulares: readonly CompromissoGranular[];
  coberturasIntegrais: readonly CoberturaIntegralPcp[];
}): ResultadoSelecaoFonte {
  const { granulares, coberturasIntegrais } = params;

  for (const g of granulares) {
    validarCompromissoGranular(g);
  }
  validarSemDuplicata(granulares);

  const coberturasSet = new Set(coberturasIntegrais.map((c) => chaveTrio(c.empresaId, c.projetoId, c.recursoId)));

  const vencedores: CompromissoGranular[] = [];
  const diagnosticos: DiagnosticoGranularidadeInsuficiente[] = [];

  // orcamento_novo nunca disputa com nada - vence sem condição.
  vencedores.push(...granulares.filter((g) => g.origem === "orcamento_novo"));

  const disputaveis = granulares.filter((g) => g.origem !== "orcamento_novo");
  const gruposPorTrio = new Map<string, CompromissoGranular[]>();
  for (const g of disputaveis) {
    const chave = chaveTrio(g.empresaId, g.projetoId, g.recursoId);
    const lista = gruposPorTrio.get(chave);
    if (lista) {
      lista.push(g);
    } else {
      gruposPorTrio.set(chave, [g]);
    }
  }

  for (const grupo of gruposPorTrio.values()) {
    const snapshotEntries = grupo.filter((g) => g.origem === "snapshot_comercial");
    const pcpEntries = grupo.filter((g) => g.origem === "pcp_real");

    if (pcpEntries.length === 0) {
      vencedores.push(...snapshotEntries);
      continue;
    }
    if (snapshotEntries.length === 0) {
      vencedores.push(...pcpEntries);
      continue;
    }

    const chavesSnapshot = new Set(snapshotEntries.map((s) => s.chaveTrabalho));
    const pcpCasados = pcpEntries.filter((p) => chavesSnapshot.has(p.chaveTrabalho));
    const pcpNaoCasados = pcpEntries.filter((p) => !chavesSnapshot.has(p.chaveTrabalho));

    const chavesPcp = new Set(pcpEntries.map((p) => p.chaveTrabalho));
    const snapshotNaoCasados = snapshotEntries.filter((s) => !chavesPcp.has(s.chaveTrabalho));

    // Substituição individual (chave granular idêntica) - sempre segura, independente de declaração.
    vencedores.push(...pcpCasados);

    if (pcpNaoCasados.length === 0 && snapshotNaoCasados.length === 0) {
      continue;
    }

    const { empresaId, projetoId, recursoId } = grupo[0];
    const coberturaDeclarada = coberturasSet.has(chaveTrio(empresaId, projetoId, recursoId));

    if (coberturaDeclarada) {
      // PCP declara cobrir integralmente o trio - vence o restante, snapshot restante é descartado.
      vencedores.push(...pcpNaoCasados);
      continue;
    }

    // Ambíguo: nem tudo bateu por chave granular, nem há declaração de
    // cobertura integral - nunca soma, nunca descarta às cegas. O trio
    // inteiro fica fora da agregação numérica.
    diagnosticos.push({
      empresaId,
      projetoId,
      recursoId,
      motivo:
        "PCP cobre parte da carga deste recurso, mas o snapshot comercial está agregado (sem chave granular) e não há declaração de cobertura integral do adaptador PCP - impossível deduplicar com segurança.",
    });
  }

  return { vencedores: Object.freeze(vencedores), diagnosticos: Object.freeze(diagnosticos) };
}
