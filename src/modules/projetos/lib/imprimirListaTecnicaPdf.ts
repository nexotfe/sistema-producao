// Dispara a impressão/"Salvar como PDF" da Lista Técnica Consolidada
// do Projeto via window.print() nativo do navegador - o layout
// impresso (cabeçalho, abas em seções, quebra de página) mora no JSX
// print-only de ListaTecnicaProjetoModal.tsx, não aqui. O navegador
// decide o nome final do arquivo; só sugerimos um nome ajustando
// document.title durante a impressão (sem garantia de que todo
// navegador respeite).
import type { ResultadoListaTecnicaProjeto } from "./gerarListaTecnicaProjeto";
import {
  assertListaTecnicaCalculada,
  nomeArquivoListaTecnica,
} from "./listaTecnicaExportacaoCompartilhada";

export function imprimirListaTecnicaPdf(
  resultado: ResultadoListaTecnicaProjeto,
  numeroProjeto: string | null,
): void {
  assertListaTecnicaCalculada(resultado);

  const tituloOriginal = document.title;
  document.title = nomeArquivoListaTecnica(numeroProjeto, "pdf").replace(/\.pdf$/, "");

  function restaurarTitulo() {
    document.title = tituloOriginal;
    window.removeEventListener("afterprint", restaurarTitulo);
  }
  window.addEventListener("afterprint", restaurarTitulo);

  window.print();
}
