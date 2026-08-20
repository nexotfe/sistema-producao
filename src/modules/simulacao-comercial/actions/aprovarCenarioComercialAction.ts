"use server";
// Aprovação do cenário comercial (DEC-007 §6.2/Fase 8b) - wrapper fino
// sobre orquestrarAprovacaoCenarioComercial.ts (mesmo motivo de
// aprovarSimulacaoComercialAction.ts: a lógica de orquestração vive num
// arquivo sem "use server", testável com dependências injetadas; este
// arquivo só monta as dependências REAIS e as injeta).
//
// Nenhum client privilegiado (service_role) é usado aqui - decisão
// confirmada com o usuário. Todas as consultas (janela comercial, base
// da previsão comercial, valor atual do orçamento) e a própria RPC usam
// o client de SESSÃO (createSupabaseServerClient), com RLS normal do
// usuário autenticado.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { prepararJanelaComercial } from "../lib/prepararJanelaComercial";
import { carregarBasePrevisaoComercial } from "../lib/cenarios/carregarBasePrevisaoComercial";
import { buscarDadosOrcamento } from "@/modules/projetos/lib/buscarDadosOrcamento";
import { calcularValorComercialProjeto } from "@/modules/projetos/lib/calcularResumoOrcamento";
import { persistirViaRpcAprovacaoCenario } from "../lib/persistirViaRpcAprovacaoCenario";
import { validarPayloadAprovacaoCenario } from "./validarPayloadAprovacaoCenario";
import {
  orquestrarAprovacaoCenarioComercial,
  MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO,
  type DependenciasAprovacaoCenarioComercial,
  type ResultadoAprovacaoCenarioAction,
} from "./orquestrarAprovacaoCenarioComercial";

export type { ResultadoAprovacaoCenarioAction };

export async function aprovarCenarioComercialAction(
  paramsRecebidos: unknown,
): Promise<ResultadoAprovacaoCenarioAction> {
  // Mesma disciplina de aprovarSimulacaoComercialAction.ts: o payload de
  // uma Server Action chega pela rede como qualquer chamada - a
  // assinatura tipada do chamador não é proteção real em runtime.
  const validacao = validarPayloadAprovacaoCenario(paramsRecebidos);

  if (!validacao.valido) {
    console.error(`aprovarCenarioComercialAction: payload rejeitado na validação - ${validacao.motivo}`);
    return { ok: false, motivo: "erro", mensagem: MENSAGEM_ERRO_GENERICA_APROVACAO_CENARIO };
  }

  const params = validacao.dados;
  const serverClient = await createSupabaseServerClient();

  const dependenciasReais: DependenciasAprovacaoCenarioComercial = {
    autenticar: async () => {
      // auth.getUser() (nunca getSession()) - revalida o token contra o
      // servidor de autenticação do Supabase, não é falsificável só
      // adulterando o que o navegador envia.
      const {
        data: { user },
        error,
      } = await serverClient.auth.getUser();
      return error || !user ? null : user.id;
    },

    buscarEmpresaId: async (userId) => {
      const { data: usuario, error } = await serverClient.from("usuarios").select("empresa_id").eq("id", userId).single();
      return error || !usuario?.empresa_id ? null : usuario.empresa_id;
    },

    prepararJanela: (empresaId, premissas) => prepararJanelaComercial(serverClient, empresaId, premissas),

    carregarBase: (empresaId, projetoId, dataSolicitadaCliente, janelaInicioGrade, dataReferenciaConfirmados, prazoInterno) =>
      carregarBasePrevisaoComercial(
        serverClient,
        empresaId,
        projetoId,
        dataSolicitadaCliente,
        janelaInicioGrade,
        dataReferenciaConfirmados,
        prazoInterno,
      ),

    // "Valor atual do orçamento" recalculado do zero no servidor - mesma
    // fonte única de useOrcamento.ts/GeradorComparadorCenarios.tsx
    // (buscarDadosOrcamento + calcularValorComercialProjeto), nunca uma
    // segunda consulta/fórmula. custoTotal = custo técnico (sem margem/
    // imposto); valorComercial só entra como referência informativa.
    buscarValoresOrcamentoAtual: async (_empresaId, projetoId) => {
      const dados = await buscarDadosOrcamento(serverClient, projetoId);
      if (!dados) return null;

      const { custoTotal, valorComercial } = calcularValorComercialProjeto({
        itens: dados.itensCalculados,
        margemLucroPercent: dados.projeto.margemLucroPercent,
        cargaTributariaPercent: dados.projeto.cargaTributariaPercent,
        cargaTributariaSugerida: dados.cargaTributariaSugerida,
        descontoPercentual: dados.projeto.descontoPercentual,
      });

      return { custoTecnicoAtual: custoTotal, valorComercialAtualReferencia: valorComercial };
    },

    // Único ponto de escrita - client de SESSÃO (nunca privilegiado). A
    // RPC (aprovar_cenario_comercial) é SECURITY DEFINER mas chamável
    // diretamente por authenticated; toda autorização/validação de
    // tenant acontece dentro dela.
    persistir: (p) => persistirViaRpcAprovacaoCenario(serverClient, p),
  };

  return orquestrarAprovacaoCenarioComercial(params, dependenciasReais);
}
