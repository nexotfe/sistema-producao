// PCP-P8I-B5.2.2: avanço por quantidade, por item contratado
// (projeto_itens) - DELIBERADAMENTE separado de
// resolverEncerramentoOfsProjetoPcp.ts (regra do proprietário: "não
// confundir encerramento das OFs com percentual de quantidade
// fabricada"). Um projeto pode estar `encerrado_quanto_as_ofs` com
// avanço de quantidade < 100% (ex.: uma OF cancelada sem substituta
// nunca repõe sua fatia) - isso não é inconsistência, é reconciliação
// comercial, fora do PCP.
//
// Regra de contabilização de LOTES operacionalmente encerrados, nunca
// medição física independente de peças produzidas (quantidade_produzida
// não é mantida pelo sistema hoje - achado registrado em B5.2.2).
export interface OfQuantidadeItemPcp {
  readonly ofId: string;
  readonly projetoItemId: string;
  readonly quantidadePlanejada: number;
  readonly estadoExecucao: "planejada" | "liberada" | "em_producao" | "suspensa" | "concluida" | "cancelada" | "desdobrada";
  readonly ofOrigemRetrabalhoId: string | null;
}

export interface AvancoQuantidadeItemPcp {
  readonly projetoItemId: string;
  readonly quantidadeContratada: number;
  /** Soma de quantidade_planejada das OFs concluídas deste item, excluindo retrabalhos - nunca medição física. */
  readonly quantidadeAtendida: number;
}

/**
 * Calcula o avanço POR ITEM, nunca agregado entre itens diferentes
 * (regra do proprietário - unidades/produtos diferentes não podem ser
 * somados num percentual global enganoso). Cada `AvancoQuantidadeItemPcp`
 * do retorno é independente - o chamador decide como (ou se) apresentar
 * vários itens lado a lado, nunca somados.
 */
export function calcularAvancoQuantidadePorItemPcp(params: {
  readonly ofs: readonly OfQuantidadeItemPcp[];
  readonly quantidadeContratadaPorItem: ReadonlyMap<string, number>;
}): readonly AvancoQuantidadeItemPcp[] {
  const { ofs, quantidadeContratadaPorItem } = params;

  const atendidaPorItem = new Map<string, number>();
  for (const of of ofs) {
    if (of.estadoExecucao !== "concluida" || of.ofOrigemRetrabalhoId !== null) continue;
    atendidaPorItem.set(of.projetoItemId, (atendidaPorItem.get(of.projetoItemId) ?? 0) + of.quantidadePlanejada);
  }

  const idsItens = new Set([...atendidaPorItem.keys(), ...Array.from(new Set(ofs.map((of) => of.projetoItemId)))]);

  return Array.from(idsItens)
    .sort()
    .map((projetoItemId) => {
      const quantidadeContratada = quantidadeContratadaPorItem.get(projetoItemId);
      if (quantidadeContratada === undefined) {
        throw new Error(
          `calcularAvancoQuantidadePorItemPcp: item ${projetoItemId} referenciado por OF(s) mas ausente de quantidadeContratadaPorItem - inconsistência de dados, nunca tratado como 0 por omissão.`,
        );
      }
      return { projetoItemId, quantidadeContratada, quantidadeAtendida: atendidaPorItem.get(projetoItemId) ?? 0 };
    });
}
