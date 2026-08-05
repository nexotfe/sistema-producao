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

export class SubconjuntoSemBomError extends Error {
  readonly produtoId: string;
  readonly codigo: string;
  readonly caminhoCodigos: string[];

  constructor(produtoId: string, codigo: string, caminhoCodigos: string[]) {
    super(
      `O subconjunto ${codigo} não possui roteiro (BOM) cadastrado (caminho: ${caminhoCodigos.join(" → ")}).`,
    );
    this.name = "SubconjuntoSemBomError";
    this.produtoId = produtoId;
    this.codigo = codigo;
    this.caminhoCodigos = caminhoCodigos;
  }
}
