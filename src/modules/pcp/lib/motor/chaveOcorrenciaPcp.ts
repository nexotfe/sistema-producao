// PCP-P8C/DEC-P8-03: identidade operacional do PCP no Motor B é o id
// real de ordens_fabricacao_operacoes - nunca a posição no Roteiro
// Mestre (ChaveOcorrencia, exclusiva do Comercial). Isso evita a
// colisão real encontrada no P8A: duas filhas de um mesmo desdobramento
// de lote copiam o mesmo bom_operacao_id da mãe (INV-PCP-26), mas cada
// uma tem um op_id próprio e distinto - só op_id identifica a ocorrência
// produtiva de forma única no PCP.
export interface ChaveOcorrenciaPcp {
  readonly opId: string;
}

export function chaveOcorrenciaPcpParaString(chave: ChaveOcorrenciaPcp): string {
  return chave.opId;
}
