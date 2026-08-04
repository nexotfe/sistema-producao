// Guarda genérica contra disparo duplicado de uma ação assíncrona
// (ex.: duplo clique antes do botão desabilitar) - iniciar() só libera
// uma "rodada" por vez; uma nova chamada enquanto a anterior está em
// andamento é rejeitada até finalizar() ser chamado. Extraída como
// classe pura (sem React) para ser testável isoladamente, mesmo padrão
// de controladorConcorrenciaBusca.ts.
export class ControladorChamadaUnica {
  private emAndamento = false;

  /** true se esta chamada pode prosseguir; false se já há uma em andamento. */
  iniciar(): boolean {
    if (this.emAndamento) return false;
    this.emAndamento = true;
    return true;
  }

  finalizar(): void {
    this.emAndamento = false;
  }
}
