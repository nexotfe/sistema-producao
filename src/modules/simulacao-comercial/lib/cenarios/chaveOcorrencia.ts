// DEC-007 §5 - Fase 0: bomOperacaoId sozinho não identifica uma
// operação de forma única - a mesma operação do roteiro pode aparecer
// várias vezes por quantidade, item do projeto ou caminho de
// subconjuntos. caminhoBomItemIds reaproveita o mesmo conceito já usado
// em gerarListaTecnicaProjeto.ts (OrigemMaterialConsolidado.caminhoBomItemIds).
export interface ChaveOcorrencia {
  projetoItemId: string;
  produtoRaizId: string;
  caminhoBomItemIds: string[];
  bomOperacaoId: string;
}

export function chaveOcorrenciaParaString(chave: ChaveOcorrencia): string {
  return `${chave.projetoItemId}::${chave.produtoRaizId}::${chave.caminhoBomItemIds.join(">")}::${chave.bomOperacaoId}`;
}
