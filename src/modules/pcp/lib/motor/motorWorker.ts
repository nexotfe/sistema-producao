// Etapa 2O.8B-I6-A: entrada REAL da Worker Thread - roda o Motor
// verdadeiro (escalonarConjuntoGenerico), nunca uma cópia. Recebe
// workerData já na forma serializável (EntradaMotorPcpSerializavel),
// reconstrói os fechamentos com reconstruirEntradaMotorPcpDeSerializavel
// (mesma construirCandidatoPcp do caminho síncrono - nunca uma segunda
// implementação da lógica de capacidade/prioridade) e devolve o
// resultado via parentPort.
//
// NUNCA importa nada relativo a reserva, Server Action ou Next.js -
// este arquivo só conhece Motor e dados planos. O supervisor
// (supervisorMotorPcp.ts) e a aquisição/liberação da reserva
// permanecem inteiramente do lado de quem constrói esta Worker.
//
// EMPACOTAMENTO (achado do P1, reconfirmar nesta etapa): o Turbopack só
// rastreia `new Worker(new URL("./motorWorker.ts", import.meta.url))`
// quando essa expressão está INLINE na própria função exportada do
// chamador - nunca dentro de um helper, mesmo passando o caminho como
// parâmetro. Por isso o `new Worker(...)` nunca vive neste arquivo nem
// em supervisorMotorPcp.ts - cada caminho (I6-B, I6-C) terá sua própria
// linha de construção inline, com toda a lógica de supervisão importada
// de supervisorMotorPcp.ts.
import { parentPort, workerData } from "node:worker_threads";
import {
  reconstruirEntradaMotorPcpDeSerializavel,
  escalonarConjuntoGenerico,
  chaveOcorrenciaPcpParaString,
  type EntradaMotorPcpSerializavel,
} from "./montarEntradaMotorPcp";

if (!parentPort) {
  throw new Error("motorWorker: precisa ser executado como Worker Thread (parentPort ausente).");
}

const entradaSerializavel = workerData as EntradaMotorPcpSerializavel;
const entrada = reconstruirEntradaMotorPcpDeSerializavel(entradaSerializavel);

const resultado = escalonarConjuntoGenerico({
  ocorrencias: entrada.ocorrencias,
  dependencias: entrada.dependencias,
  registroCandidatos: entrada.registroCandidatos,
  datasGradeCompartilhada: entradaSerializavel.datasGradeCompartilhada,
  criterioPrioridadeDeNegocio: entrada.criterioPrioridadeDeNegocio,
  serializarChave: chaveOcorrenciaPcpParaString,
});

parentPort.postMessage(resultado);
