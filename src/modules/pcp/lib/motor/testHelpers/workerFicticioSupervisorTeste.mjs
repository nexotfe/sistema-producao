// ETAPA 2O.8B-I6H - fixture de teste REAL (Worker Thread real, não
// simulada) para comprovar que o supervisor (supervisorMotorPcp.ts)
// confirma encerramento antes de reportar qualquer saída que não seja
// 'concluido' - mesmo para um `error` isolado, nunca causado por corte
// de limite. Nunca referencia Motor, PCP ou qualquer dado real. Não
// precisa de bundling (sem import de "@/") - pode ser spawnada direto.
import { workerData } from "node:worker_threads";

const { modo } = workerData;

if (modo === "erro_rapido") {
  throw new Error("erro ficticio deliberado - teste I6H de confirmacao de encerramento");
}

throw new Error(`workerFicticioSupervisorTeste: modo desconhecido: ${modo}`);
