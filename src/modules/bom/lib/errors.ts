export class OperacaoSemRecursoError extends Error {
  readonly bomOperacaoId: string;

  constructor(bomOperacaoId: string) {
    super(
      `A operação ${bomOperacaoId} do Roteiro não tem Recurso Produtivo vinculado. Vincule um recurso antes de simular.`,
    );
    this.name = "OperacaoSemRecursoError";
    this.bomOperacaoId = bomOperacaoId;
  }
}

export class ProfundidadeMaximaBomError extends Error {
  readonly bomId: string;

  constructor(bomId: string) {
    super(
      `Profundidade máxima de estrutura (BOM) excedida no bom ${bomId} - possível referência circular.`,
    );
    this.name = "ProfundidadeMaximaBomError";
    this.bomId = bomId;
  }
}
