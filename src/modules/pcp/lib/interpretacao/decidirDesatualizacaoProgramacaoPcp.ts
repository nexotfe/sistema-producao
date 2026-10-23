// PCP-P8I-B5.2.1: classificação A (desatualização) - só se aplica à
// programação VIGENTE persistida (pcp_programacoes.empresa_capacidade_
// versao_origem × empresa_capacidade_versoes.versao atual, ambos lidos
// por buscarProgramacaoVigentePcp.ts, B5.1). Um resultado de CÁLCULO
// (solicitarCalculoProgramacaoPcpAction, B4) nunca passa por esta
// função - já é garantidamente fresco pelo próprio mecanismo de
// comparação de versão embutido na Server Action (descarta e nunca
// retorna um resultado obtido com capacidade desatualizada).
//
// Função pura - sem I/O, não decide nada sobre o Motor/Assembler.
export type DesatualizacaoProgramacaoPcp = "vigente_atualizada" | "vigente_desatualizada";

export function decidirDesatualizacaoProgramacaoPcp(params: {
  readonly versaoOrigem: number;
  readonly versaoAtual: number;
}): DesatualizacaoProgramacaoPcp {
  return params.versaoOrigem === params.versaoAtual ? "vigente_atualizada" : "vigente_desatualizada";
}
