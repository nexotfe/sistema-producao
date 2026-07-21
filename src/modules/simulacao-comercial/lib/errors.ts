export class ProjetoSemItensError extends Error {
  readonly projetoId: string;

  constructor(projetoId: string) {
    super(
      `O projeto ${projetoId} não possui itens de projeto ativos. Não é possível simular capacidade sem pelo menos um item.`,
    );
    this.name = "ProjetoSemItensError";
    this.projetoId = projetoId;
  }
}

export class RoteiroNaoEncontradoError extends Error {
  readonly produtoId: string;

  constructor(produtoId: string) {
    super(
      `Nenhuma estrutura BOM encontrada para o produto ${produtoId}. Cadastre o Roteiro antes de simular.`,
    );
    this.name = "RoteiroNaoEncontradoError";
    this.produtoId = produtoId;
  }
}

export class RecursoSemCapacidadeCadastradaError extends Error {
  readonly recursoId: string;

  constructor(recursoId: string) {
    super(
      `O recurso ${recursoId} não tem capacidade_horas_dia cadastrada. Configure a capacidade do recurso antes de simular.`,
    );
    this.name = "RecursoSemCapacidadeCadastradaError";
    this.recursoId = recursoId;
  }
}
