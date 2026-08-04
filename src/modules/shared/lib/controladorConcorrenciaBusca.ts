// Núcleo puro (sem React, sem I/O) do controle de concorrência de
// useBuscaPaginada.ts - extraído para ser testável sem depender de
// infraestrutura de teste de componente/hook (este projeto não tem
// nenhuma ainda - decisão explícita de não introduzir isso nesta
// entrega). O hook em si (useBuscaPaginada.ts) é só um envelope fino de
// React (useState/useRef) em volta desta classe.
//
// Duas preocupações distintas, dois mecanismos distintos:
//   - geração: incrementada SÓ quando o termo muda - qualquer
//     requisição de uma geração anterior nunca bloqueia nem libera o
//     estado da geração atual, mesmo que ainda esteja em voo quando o
//     termo muda. Trocar de termo NUNCA espera a geração anterior
//     terminar - reivindica o controle de imediato (novaGeracao nunca
//     é bloqueada por nada).
//   - token: identifica cada requisição individual dentro de uma
//     geração - finalizar() só sinaliza "pode limpar o indicador de
//     carregamento" se a requisição que está terminando ainda for a
//     marcada como ativa (mesmo token). Uma requisição antiga que
//     termina depois de já ter sido substituída nunca reabre o
//     indicador nem libera o controle da nova.
// Dentro de uma MESMA geração, novaPagina() só concede uma identidade
// nova se não houver outra página da MESMA geração já em voo - por
// isso as páginas chegam e são processadas em ordem, sem precisar de
// id por página.
export type IdentidadeRequisicaoBusca = { geracao: number; token: number };

export class ControladorConcorrenciaBusca {
  private geracao = 0;
  private token = 0;
  private ativa: IdentidadeRequisicaoBusca | null = null;

  /** Nova geração (mudança de termo) - nunca bloqueada, sempre concede identidade nova. */
  novaGeracao(): IdentidadeRequisicaoBusca {
    this.geracao += 1;
    this.token += 1;
    const id: IdentidadeRequisicaoBusca = { geracao: this.geracao, token: this.token };
    this.ativa = id;
    return id;
  }

  /**
   * Nova página (carregar mais) - só concede identidade se não houver
   * outra requisição da MESMA geração atual em voo. Retorna `null`
   * quando bloqueado (chamador não deve disparar a busca).
   */
  novaPagina(): IdentidadeRequisicaoBusca | null {
    if (this.ativa && this.ativa.geracao === this.geracao) {
      return null;
    }
    this.token += 1;
    const id: IdentidadeRequisicaoBusca = { geracao: this.geracao, token: this.token };
    this.ativa = id;
    return id;
  }

  /** true se `id` ainda pertence à geração atual - resposta de uma geração antiga deve ser descartada. */
  ehGeracaoAtual(id: IdentidadeRequisicaoBusca): boolean {
    return id.geracao === this.geracao;
  }

  /**
   * Chamado quando uma requisição termina (sucesso ou erro). Retorna
   * `true` só se `id` ainda for a requisição ativa (mesmo token) - o
   * chamador só deve limpar o indicador de carregamento nesse caso.
   * Uma requisição antiga, já substituída, sempre recebe `false` aqui e
   * não deve mexer em nenhum estado de carregamento.
   */
  finalizar(id: IdentidadeRequisicaoBusca): boolean {
    if (this.ativa?.token === id.token) {
      this.ativa = null;
      return true;
    }
    return false;
  }
}
