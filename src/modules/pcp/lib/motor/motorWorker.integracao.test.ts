// Etapa 2O.8B-I6-A: integração REAL - spawna de verdade a Worker Thread
// executando motorWorker.ts (o Motor real, escalonarConjuntoGenerico,
// nunca uma cópia). Fora de Next.js/Turbopack, o Node puro não resolve
// o alias "@/" do projeto - por isso este teste empacota motorWorker.ts
// com o próprio Vite (já presente via vitest) antes de spawná-lo. Isso
// é só um recurso de TESTE: a prova real de empacotamento em produção
// (Turbopack) é uma etapa separada, dedicada, não substituída por este
// arquivo.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { executarComSupervisao } from "./supervisorMotorPcp";
import { escalonarConjuntoGenerico, chaveOcorrenciaPcpParaString, construirCandidatoPcp } from "./montarEntradaMotorPcp";
import type { EntradaMotorPcpSerializavel } from "./montarEntradaMotorPcp";
import type { ResultadoOcorrenciaEscalonada } from "@/modules/simulacao-comercial/lib/cenarios/escalonadorConjunto";
import type { ChaveOcorrenciaPcp } from "./chaveOcorrenciaPcp";

const __dirnameEsm = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirnameEsm, "../../../../");

let outDir: string;
let workerBundlePath: string;

beforeAll(async () => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "motor-worker-bundle-"));
  await build({
    configFile: false,
    resolve: { alias: [{ find: "@", replacement: SRC_DIR }] },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      target: "node20",
      lib: {
        entry: path.resolve(__dirnameEsm, "motorWorker.ts"),
        formats: ["es"],
        fileName: () => "motorWorker.bundle.mjs",
      },
      rollupOptions: { external: (id: string) => id.startsWith("node:") },
    },
    logLevel: "warn",
  });
  workerBundlePath = path.join(outDir, "motorWorker.bundle.mjs");
  expect(fs.existsSync(workerBundlePath)).toBe(true);
}, 60_000);

afterAll(() => {
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

const DATAS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];

function construirSerializavelPequeno(): EntradaMotorPcpSerializavel {
  return {
    ocorrencias: [
      { chave: { opId: "op-1" }, projetoId: "proj-1", necessarioHorasPadrao: 3, candidatoIdsPorPrioridade: ["r1"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] },
      { chave: { opId: "op-2" }, projetoId: "proj-2", necessarioHorasPadrao: 5, candidatoIdsPorPrioridade: ["r1", "r2"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] },
    ],
    dependencias: [],
    candidatos: [
      { recursoId: "r1", capacidadeHorasDia: 8, produtividade: 1 },
      { recursoId: "r2", capacidadeHorasDia: 6, produtividade: 0.9 },
    ],
    datasGradeCompartilhada: DATAS,
    diasProdutivos: DATAS,
    posicaoPorProjeto: { "proj-1": 1, "proj-2": 2 },
    excluidas: [],
    ofIdPorOpId: { "op-1": "of-1", "op-2": "of-2" },
  };
}

function executarDiretoParaComparacao(serializavel: EntradaMotorPcpSerializavel): Map<string, ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>> {
  const diasProdutivosSet = new Set(serializavel.diasProdutivos);
  const registroCandidatos = new Map(
    serializavel.candidatos.map((c) => [
      c.recursoId,
      construirCandidatoPcp({ recursoId: c.recursoId, capacidadeHorasDia: c.capacidadeHorasDia, produtividade: c.produtividade, datasGradeCompartilhada: serializavel.datasGradeCompartilhada, diasProdutivos: diasProdutivosSet }),
    ]),
  );
  const posicaoPorProjeto = new Map(Object.entries(serializavel.posicaoPorProjeto));
  return escalonarConjuntoGenerico({
    ocorrencias: serializavel.ocorrencias,
    dependencias: serializavel.dependencias,
    registroCandidatos,
    datasGradeCompartilhada: serializavel.datasGradeCompartilhada,
    criterioPrioridadeDeNegocio: (oc) => posicaoPorProjeto.get(oc.projetoId) ?? Number.POSITIVE_INFINITY,
    serializarChave: chaveOcorrenciaPcpParaString,
  });
}

describe("I6-A - motorWorker.ts real, spawnado de verdade como Worker Thread", () => {
  it("conclusão normal: resultado da Worker é IDÊNTICO à execução direta no thread principal", async () => {
    const serializavel = construirSerializavelPequeno();
    const worker = new Worker(workerBundlePath, { workerData: serializavel });

    const supervisao = await executarComSupervisao<Map<string, ResultadoOcorrenciaEscalonada<ChaveOcorrenciaPcp>>>(worker, { limiteMs: 15_000 });

    expect(supervisao.situacao).toBe("concluido");
    if (supervisao.situacao !== "concluido") return;

    const resultadoDireto = executarDiretoParaComparacao(serializavel);
    expect(supervisao.resultado.size).toBe(resultadoDireto.size);
    for (const [chave, valor] of resultadoDireto) {
      expect(supervisao.resultado.get(chave)).toEqual(valor);
    }
  }, 20_000);

  it("limite abaixo do tempo de montagem+escalonamento: interrompido pelo supervisor mesmo rodando o Motor real", async () => {
    // Fixture maior o bastante para o Motor real não terminar em
    // praticamente 0ms (sem precisar reproduzir a escala de 18.000 OPs
    // da P3 - só precisa ser MAIOR que o limite artificialmente baixo).
    const muitasOcorrencias = Array.from({ length: 400 }, (_, i) => ({
      chave: { opId: `op-${i}` },
      projetoId: i % 2 === 0 ? "proj-1" : "proj-2",
      necessarioHorasPadrao: 2 + (i % 5),
      candidatoIdsPorPrioridade: ["r1", "r2"],
      ehOrcamentoNovo: false,
      dataInicioJanela: DATAS[0],
    }));
    const serializavel: EntradaMotorPcpSerializavel = {
      ocorrencias: muitasOcorrencias,
      dependencias: [],
      candidatos: [
        { recursoId: "r1", capacidadeHorasDia: 8, produtividade: 1 },
        { recursoId: "r2", capacidadeHorasDia: 6, produtividade: 0.9 },
      ],
      datasGradeCompartilhada: DATAS,
      diasProdutivos: DATAS,
      posicaoPorProjeto: { "proj-1": 1, "proj-2": 2 },
      excluidas: [],
      ofIdPorOpId: Object.fromEntries(muitasOcorrencias.map((o, i) => [o.chave.opId, i % 2 === 0 ? "of-1" : "of-2"])),
    };

    const worker = new Worker(workerBundlePath, { workerData: serializavel });
    // Limite artificialmente baixo (1ms) - o objetivo NÃO é medir o
    // tempo real do Motor (isso a P3 já mediu), é provar que o
    // supervisor corta de verdade uma Worker rodando o Motor REAL,
    // mesma garantia já provada na P1 contra um laço fictício.
    const supervisao = await executarComSupervisao(worker, { limiteMs: 1 });

    expect(supervisao.situacao).toBe("interrompido_por_limite");
  }, 20_000);

  it("entrada inválida (dependência para ocorrência inexistente): a Worker real reporta erro, supervisor classifica como erro_na_worker", async () => {
    const serializavel: EntradaMotorPcpSerializavel = {
      ocorrencias: [{ chave: { opId: "op-1" }, projetoId: "proj-1", necessarioHorasPadrao: 2, candidatoIdsPorPrioridade: ["r1"], ehOrcamentoNovo: false, dataInicioJanela: DATAS[0] }],
      dependencias: [{ predecessora: { opId: "inexistente" }, sucessora: { opId: "op-1" }, tipo: "sequencia_roteiro" }],
      candidatos: [{ recursoId: "r1", capacidadeHorasDia: 8, produtividade: 1 }],
      datasGradeCompartilhada: DATAS,
      diasProdutivos: DATAS,
      posicaoPorProjeto: { "proj-1": 1 },
      excluidas: [],
      ofIdPorOpId: { "op-1": "of-1" },
    };

    const worker = new Worker(workerBundlePath, { workerData: serializavel });
    const supervisao = await executarComSupervisao(worker, { limiteMs: 15_000, margemConfirmacaoTerminateMs: 5_000 });

    expect(supervisao.situacao).toBe("erro_na_worker");
    if (supervisao.situacao === "erro_na_worker") {
      expect(supervisao.mensagem).toContain("inexistente");
    }
  }, 20_000);
});

// ETAPA 2O.8B-I6H: Worker Thread REAL (não simulada) para comprovar a
// exigência do usuário - um `error` isolado só é reportado DEPOIS de
// `worker.terminate()` ser chamado e confirmado (Promise resolvida ou
// `exit` chegando), nunca presumido pelo simples disparo do evento.
// Fixture sem dependência de alias "@/" - spawnada direto, sem bundling.
describe("I6H - supervisor real: confirmação de encerramento após 'error' isolado", () => {
  const FIXTURE_URL = new URL("./testHelpers/workerFicticioSupervisorTeste.mjs", import.meta.url);

  it("erro isolado com encerramento confirmado dentro da margem: situação final é erro_na_worker, mensagem original preservada", async () => {
    const worker = new Worker(FIXTURE_URL, { workerData: { modo: "erro_rapido" } });

    const supervisao = await executarComSupervisao(worker, { limiteMs: 15_000, margemConfirmacaoTerminateMs: 5_000 });

    expect(supervisao.situacao).toBe("erro_na_worker");
    if (supervisao.situacao === "erro_na_worker") {
      expect(supervisao.mensagem).toContain("erro ficticio deliberado");
    }
  }, 20_000);

  it("margem de confirmação artificialmente mínima: resultado NUNCA presume sucesso, seja qual for o lado que vencer a corrida margem-vs-terminate()", async () => {
    const worker = new Worker(FIXTURE_URL, { workerData: { modo: "erro_rapido" } });

    // Margem artificialmente zerada - o mesmo recurso já usado no
    // sandbox descartável desta sessão para forçar uma corrida real
    // entre o teto de margem (timeoutMargemConfirmacao) e a confirmação
    // real de encerramento (terminate() resolvido, ou 'exit' chegando
    // com uma confirmação de erro pendente). QUAL lado vence essa
    // corrida com margem=0 NÃO é determinístico (ambos são, na prática,
    // "imediatos") - por isso o teste não afirma qual dos dois ramos
    // ocorre, só o INVARIANTE que importa de verdade: nenhum dos dois
    // ramos possíveis presume sucesso. Isso elimina o flakiness sem
    // mudar o que está sendo testado (achado da auditoria pós-rodada
    // anterior: o teste anterior afirmava só o ramo "margem esgotada",
    // que de fato pode perder a corrida para "erro_na_worker" com
    // encerramento genuinamente confirmado - os dois são corretos).
    const supervisao = await executarComSupervisao(worker, { limiteMs: 15_000, margemConfirmacaoTerminateMs: 0 });

    expect(["erro_na_worker", "estado_desconhecido"]).toContain(supervisao.situacao);
    if (supervisao.situacao === "erro_na_worker") {
      // Mesmo vencendo a corrida por terminate()/exit, a mensagem
      // original nunca pode ser substituída por um resultado genérico.
      expect(supervisao.mensagem).toContain("erro ficticio deliberado");
    }
    if (supervisao.situacao === "estado_desconhecido") {
      expect(supervisao.origem).toBe("margem_confirmacao_terminate_esgotada");
    }
  }, 20_000);
});
