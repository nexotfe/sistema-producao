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

// Entrega 2 (distribuição parcial): o schema hoje já impede
// estruturalmente um recurso aparecer duplicado na lista de
// compatíveis de si mesmo (CHECK origem<>destino) ou duas vezes na
// mesma lista (unique parcial em (origem,destino) entre ativos) - mas
// o núcleo não confia só nisso, pelo mesmo motivo que
// validarPayloadAprovacao.ts não confia só no tipo TypeScript. Se
// aparecer mesmo assim, é corrupção de cadastro ou erro de montagem
// das entradas - erro técnico controlado, nunca ignorado
// silenciosamente.
export class CandidatoDuplicadoError extends Error {
  readonly recursoOriginalId: string;
  readonly recursoDuplicadoId: string;

  constructor(recursoOriginalId: string, recursoDuplicadoId: string) {
    super(
      `Recurso ${recursoDuplicadoId} aparece mais de uma vez entre os candidatos do recurso original ${recursoOriginalId} - corrupção de cadastro ou de montagem de entradas, não um caso de negócio válido.`,
    );
    this.name = "CandidatoDuplicadoError";
    this.recursoOriginalId = recursoOriginalId;
    this.recursoDuplicadoId = recursoDuplicadoId;
  }
}

// Fase 2 (leitura dupla, carregarSnapshotPersistido.ts): sinaliza que um
// snapshot já persistido não respeita as invariantes estruturais
// esperadas (item versao_resultado_motor=1 com filhos; item
// versao_resultado_motor=2 cuja soma das distribuições + déficit não
// bate com necessário; item versao_resultado_motor=2 sem filhos fora do
// caso de déficit total). Erro de domínio controlado - nunca deveria
// acontecer dado que a RPC v4 valida isso antes de persistir, mas a
// leitura não confia cegamente no que está no banco.
export class SnapshotInconsistenteError extends Error {
  readonly simulacaoComercialId: string;
  readonly bomOperacaoId: string;

  constructor(simulacaoComercialId: string, bomOperacaoId: string, motivo: string) {
    super(`Snapshot ${simulacaoComercialId}, operação ${bomOperacaoId}: estrutura inconsistente - ${motivo}.`);
    this.name = "SnapshotInconsistenteError";
    this.simulacaoComercialId = simulacaoComercialId;
    this.bomOperacaoId = bomOperacaoId;
  }
}
