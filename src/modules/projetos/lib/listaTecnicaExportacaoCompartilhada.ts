// Regras compartilhadas entre as exportações (Excel e PDF) da Lista
// Técnica Consolidada do Projeto: nome de arquivo seguro a partir do
// número do projeto e a guarda que impede exportar um resultado que
// não foi calculado com sucesso (mesma condição que já desabilita os
// botões na tela - reforçada aqui para o caso de uso direto da
// função).
import type { ResultadoListaTecnicaProjeto } from "./gerarListaTecnicaProjeto";

export function nomeArquivoListaTecnica(numeroProjeto: string | null, extensao: string): string {
  const numeroLimpo = (numeroProjeto ?? "").replace(/[^0-9]/g, "");
  const base = numeroLimpo ? `lista-tecnica-projeto-${numeroLimpo}` : "lista-tecnica-projeto";
  return `${base}.${extensao}`;
}

export function assertListaTecnicaCalculada(resultado: ResultadoListaTecnicaProjeto): void {
  if (resultado.estado !== "calculado") {
    throw new Error(
      "A exportação só está disponível quando a lista técnica foi calculada com sucesso.",
    );
  }
}
