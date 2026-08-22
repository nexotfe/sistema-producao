"use server";
// Aprovação do cenário comercial (DEC-007 §6.2/Fase 8b) - wrapper fino
// sobre orquestrarAprovacaoCenarioComercial.ts (mesmo motivo de
// aprovarSimulacaoComercialAction.ts: a lógica de orquestração vive num
// arquivo sem "use server", testável com dependências injetadas; este
// arquivo só monta as dependências REAIS e as injeta).
//
// Migração 20260822165408, Fase 1 da transição em duas fases (correção
// do achado do orçamento 260007 - ver cabeçalho da migration): este
// arquivo passou a chamar aprovar_cenario_comercial_v2 (RPC NOVA,
// service_role-only) em vez de aprovar_cenario_comercial (RPC antiga,
// 12 parâmetros, que continua existindo no banco intocada até a Fase 2
// remover - nada neste arquivo a chama mais). current_user dentro de
// uma função SECURITY DEFINER não distingue esta Server Action de uma
// chamada direta feita por um `authenticated` qualquer, então a
// autorização (admin ativo, mesma regra de usuario_e_admin()) agora é
// verificada AQUI, com o client de SESSÃO, ANTES de qualquer client
// privilegiado ser criado. O client privilegiado
// (createSupabaseServiceClient) só é instanciado dentro de `persistir`,
// no fim do fluxo, depois que autenticação, autorização, janela, base,
// orçamento E a assinatura técnica já foram resolvidos com o client de
// sessão normal (RLS aplicada) - mesmo padrão já usado por
// aprovarSimulacaoComercialAction.ts/v5.
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { prepararJanelaComercial } from "../lib/prepararJanelaComercial";
import { carregarBasePrevisaoComercial } from "../lib/cenarios/carregarBasePrevisaoComercial";
import { buscarDadosOrcamento } from "@/modules/projetos/lib/buscarDadosOrcamento";
import { calcularValorComercialProjeto } from "@/modules/projetos/lib/calcularResumoOrcamento";
import { persistirViaRpcAprovacaoCenario } from "../lib/persistirViaRpcAprovacaoCenario";
import { buscarDadosAssinaturaTecnica } from "../lib/cenarios/buscarDadosAssinaturaTecnica";
import { construirDocumentoAssinaturaTecnica } from "../lib/cenarios/construirDocumentoAssinaturaTecnica";
import { calcularHashAssinaturaTecnica } from "../lib/cenarios/calcularHashAssinaturaTecnica";
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

    // Reproduz EXATAMENTE o predicado hoje aplicado por usuario_e_admin()
    // (public.profiles: ativo=true, nivel_acesso='admin') - nunca uma
    // regra nova nem mais frouxa. Consulta a própria linha do usuário
    // (id=userId) com o client de SESSÃO: a policy de SELECT em
    // profiles permite "id = auth.uid()" independente de ser admin, então
    // esta leitura nunca falha por RLS para o próprio usuário - só a
    // condição nivel_acesso/ativo decide o resultado. empresa_id vem
    // desta MESMA linha (nunca de public.usuarios, que não tem coluna
    // `ativo` e não é a fonte que usuario_e_admin() usa).
    autorizarAprovador: async (userId) => {
      const { data, error } = await serverClient.from("profiles").select("empresa_id, nivel_acesso, ativo").eq("id", userId).maybeSingle();

      if (error || !data || !data.ativo || data.nivel_acesso !== "admin") {
        return null;
      }

      return { empresaId: data.empresa_id };
    },

    prepararJanela: (empresaId, premissas, modoDisponibilidadeMaterial) =>
      prepararJanelaComercial(serverClient, empresaId, premissas, modoDisponibilidadeMaterial),

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

      return { custoTecnicoAtual: custoTotal, valorComercialAtualReferencia: valorComercial, tipoProjeto: dados.projeto.tipoProjeto };
    },

    // Só leitura (carregarBaseCenarios/carregarContextoCalendario/BOM -
    // as mesmas tabelas que a tela de Cenários já lê do navegador com
    // RLS normal) - client de SESSÃO, nunca privilegiado. Calculada
    // sobre a MESMA janela produtiva que o orquestrador grava no
    // snapshot (ver chamada em orquestrarAprovacaoCenarioComercial.ts).
    calcularAssinaturaTecnica: async (empresaId, projetoId, janelaInicio, janelaFim) => {
      const dados = await buscarDadosAssinaturaTecnica(serverClient, empresaId, projetoId, janelaInicio, janelaFim);
      const documento = construirDocumentoAssinaturaTecnica(dados);
      return calcularHashAssinaturaTecnica(documento);
    },

    // Único ponto de escrita - client PRIVILEGIADO (service_role),
    // criado só aqui dentro, nunca antes: autenticação (autenticar),
    // autorização (autorizarAprovador) e todo o recálculo já rodaram
    // com o client de sessão normal quando este ponto é alcançado. A
    // RPC chamada por persistirViaRpcAprovacaoCenario.ts é sempre
    // aprovar_cenario_comercial_v2 (migração 20260822165408) - não
    // aceita chamada direta de authenticated - autorização e tenant já
    // vêm validados por parâmetro explícito (p_empresa_id/
    // p_aprovado_por), nunca resolvidos de dentro dela. A RPC antiga
    // (aprovar_cenario_comercial) continua existindo no banco até a
    // Fase 2 da transição remover, mas nada neste arquivo a chama.
    persistir: (p) => persistirViaRpcAprovacaoCenario(createSupabaseServiceClient(), p),
  };

  return orquestrarAprovacaoCenarioComercial(params, dependenciasReais);
}
