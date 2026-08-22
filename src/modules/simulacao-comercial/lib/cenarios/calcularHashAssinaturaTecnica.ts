// Hash SHA-256 do documento canônico de assinatura técnica
// (construirDocumentoAssinaturaTecnica.ts). Usa Web Crypto (crypto.subtle)
// - não é "duas implementações que devem dar o mesmo resultado": é
// literalmente a mesma função, chamada tanto no navegador (comparação
// visual em useOrcamento.ts/useProposta.ts) quanto no Server Action
// (cálculo autoritativo, Node 19+ expõe globalThis.crypto.subtle) - zero
// risco de as duas implementações divergirem, porque só existe uma.
//
// JSON.stringify do documento já é a serialização canônica: o documento
// é construído com chaves em ordem fixa e arrays já ordenados
// (construirDocumentoAssinaturaTecnica.ts), então não precisa de
// nenhuma lib de canonicalização - a MESMA função, chamada duas vezes
// com o mesmo documento, sempre produz o mesmo hash.
import type { DocumentoAssinaturaTecnica } from "./construirDocumentoAssinaturaTecnica";

export async function calcularHashAssinaturaTecnica(
  documento: DocumentoAssinaturaTecnica,
): Promise<string> {
  const texto = JSON.stringify(documento);
  const bytes = new TextEncoder().encode(texto);
  const bufferHash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(bufferHash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
