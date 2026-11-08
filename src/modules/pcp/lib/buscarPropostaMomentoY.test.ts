// Etapa 43: testes locais dos retornos de erro de buscarPropostaMomentoY,
// com um client Supabase falso (só a fatia .rpc() de fato usada) - nunca
// escreve, nunca chama service_role. Cobre especificamente o requisito
// desta etapa: o ramo erro_desconhecido não deve carregar a mensagem
// tecnica bruta no retorno (só no log de servidor via console.error).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPropostaMomentoY } from "./buscarPropostaMomentoY";

type RespostaRpc = { data: unknown; error: { message: string; code?: string } | null };

function criarClienteFalso(respostas: Record<string, RespostaRpc>): SupabaseClient {
  return {
    rpc(nome: string) {
      const resposta = respostas[nome];
      if (!resposta) throw new Error(`fake client: rpc ${nome} sem resposta configurada.`);
      return Promise.resolve(resposta);
    },
  } as unknown as SupabaseClient;
}

const OF_ID = "dde392ab-09ba-4aeb-858f-940e5f2037a6";
const EMPRESA_ID = "f835684a-0400-43a5-ba54-dd4629230c3c";

describe("buscarPropostaMomentoY", () => {
  let spyConsoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spyConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    spyConsoleError.mockRestore();
  });

  it("regime legado: não chama sugerir_proposta_momento_y, propostaOriginal vazia, interruptor repassado", async () => {
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: false, error: null },
      determinar_regime_momento_y_of: { data: "legado", error: null },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({
      ok: true,
      leitura: { ofId: OF_ID, regime: "legado", propostaOriginal: [], interruptorAtivo: false },
    });
  });

  it("regime pendente_momento_y: preserva a proposta exatamente como veio da RPC", async () => {
    const propostaReal = [
      { materia_prima_id: "mp-1", quantidade_sugerida: 1.6, unidade: "metro", descricao: "BARRA REDONDA", especificacao: null },
    ];
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: true, error: null },
      determinar_regime_momento_y_of: { data: "pendente_momento_y", error: null },
      sugerir_proposta_momento_y: { data: propostaReal, error: null },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({
      ok: true,
      leitura: { ofId: OF_ID, regime: "pendente_momento_y", propostaOriginal: propostaReal, interruptorAtivo: true },
    });
  });

  it("empresa não resolvida: motivo empresa_nao_encontrada, sem chamar as demais RPCs", async () => {
    const client = criarClienteFalso({ empresa_atual_id: { data: null, error: null } });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({ ok: false, motivo: "empresa_nao_encontrada" });
  });

  it("OF de outra empresa: mensagem 'nao encontrada' mapeada para of_nao_encontrada, texto bruto não exposto", async () => {
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: false, error: null },
      determinar_regime_momento_y_of: {
        data: null,
        error: { message: `determinar_regime_momento_y_of: OF ${OF_ID} nao encontrada na empresa ${EMPRESA_ID}.` },
      },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({ ok: false, motivo: "of_nao_encontrada" });
    expect(JSON.stringify(resultado)).not.toContain(EMPRESA_ID);
  });

  it("papel insuficiente: mapeado para nao_autorizado", async () => {
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: true, error: null },
      determinar_regime_momento_y_of: { data: "pendente_momento_y", error: null },
      sugerir_proposta_momento_y: {
        data: null,
        error: { message: "sugerir_proposta_momento_y: exige papel funcional pcp ou administrador." },
      },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({ ok: false, motivo: "nao_autorizado" });
  });

  it("OF não aprovada: mapeado para of_nao_aprovada", async () => {
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: true, error: null },
      determinar_regime_momento_y_of: { data: "pendente_momento_y", error: null },
      sugerir_proposta_momento_y: {
        data: null,
        error: { message: "calcular_proposta_bom_of: OF ... nao esta aprovada." },
      },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({ ok: false, motivo: "of_nao_aprovada" });
  });

  it("falha ao ler o interruptor da empresa: erro_desconhecido, sem mensagem bruta no retorno", async () => {
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: null, error: { message: "falha interna no interruptor" } },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);
    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
    expect(spyConsoleError).toHaveBeenCalledTimes(1);
  });

  it("erro técnico inesperado: retorno NUNCA carrega a mensagem bruta; ela só vai para console.error", async () => {
    const mensagemSensivel = "duplicate key value violates unique constraint algo_interno_sensivel";
    const client = criarClienteFalso({
      empresa_atual_id: { data: EMPRESA_ID, error: null },
      momento_y_ativo_para_empresa: { data: false, error: null },
      determinar_regime_momento_y_of: {
        data: null,
        error: { message: mensagemSensivel, code: "23505" },
      },
    });
    const resultado = await buscarPropostaMomentoY(client, OF_ID);

    expect(resultado).toEqual({ ok: false, motivo: "erro_desconhecido" });
    expect(JSON.stringify(resultado)).not.toContain(mensagemSensivel);
    expect(spyConsoleError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(spyConsoleError.mock.calls)).toContain(mensagemSensivel);
  });
});
