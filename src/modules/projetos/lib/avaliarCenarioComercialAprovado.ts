// DEC-007 §6.2/Fase 8b (invalidação automática de cenário aprovado) -
// único ponto de I/O que decide se um cenário comercial aprovado ainda
// vale para uso corrente. Reutilizado por useOrcamento.ts, useProposta.ts
// e a tela de Cenários - a REGRA em si mora só em
// decidirUsoCenarioComercialAprovado.ts (pura); esta função só monta os
// dados que a regra precisa e trata erro/short-circuit de I/O.
//
// GARANTIA ESTRUTURAL (regra do usuário: "enquanto verifica a
// assinatura, nunca mostrar temporariamente o cenário antigo como
// fonte corrente"): esta função é sempre `await`ada pelo chamador
// DENTRO do mesmo carregamento assíncrono que já busca o resto dos
// dados da tela (mesmo Promise.all/sequência), ANTES do primeiro
// setState daquele carregamento - nunca depois, nunca num efeito
// separado. Não existe, portanto, um render intermediário em que o
// estado "verificando" da função pura fica visível: o que a tela
// aplica ao state é sempre o resultado JÁ resolvido (ok/erro/
// congelamento_definitivo/assinatura_nula_legado).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarDadosAssinaturaTecnica } from "@/modules/simulacao-comercial/lib/cenarios/buscarDadosAssinaturaTecnica";
import { construirDocumentoAssinaturaTecnica } from "@/modules/simulacao-comercial/lib/cenarios/construirDocumentoAssinaturaTecnica";
import { calcularHashAssinaturaTecnica } from "@/modules/simulacao-comercial/lib/cenarios/calcularHashAssinaturaTecnica";
import { decidirUsoCenarioComercialAprovado, type DecisaoUsoCenarioComercial } from "./decidirUsoCenarioComercialAprovado";
import type { CenarioComercialAprovadoResumo } from "./buscarCenarioComercialAprovado";
import type { ProjectStatus } from "../types";

/**
 * `cenario` null = nenhum cenário aprovado vigente - devolve null
 * (comportamento antigo do chamador: custo ao vivo, SEM aviso nenhum,
 * caso completamente diferente de "desatualizado").
 */
export async function avaliarCenarioComercialAprovado(
  client: SupabaseClient,
  projetoId: string,
  statusProjeto: ProjectStatus,
  cenario: CenarioComercialAprovadoResumo | null,
): Promise<DecisaoUsoCenarioComercial | null> {
  if (!cenario) {
    return null;
  }

  const projetoAprovado = statusProjeto === "aprovado";

  // Projeto com aprovação final: congelamento definitivo SEMPRE - nunca
  // recalcula a assinatura (regra explícita do usuário), nem que faça
  // uma chamada de rede à toa.
  if (projetoAprovado) {
    return decidirUsoCenarioComercialAprovado({
      projetoAprovado: true,
      assinaturaTecnicaArmazenada: cenario.assinaturaTecnica,
      verificacao: { status: "verificando" }, // ignorado pela regra pura quando projetoAprovado=true
    });
  }

  // Cenário legado (assinatura_tecnica NULL) ou snapshot sem os campos
  // de janela (formato inesperado): a resposta já está decidida sem
  // precisar de nenhuma chamada de rede - short-circuit deliberado,
  // nunca calcula uma assinatura ao vivo que seria descartada de
  // qualquer forma.
  if (cenario.assinaturaTecnica === null) {
    return decidirUsoCenarioComercialAprovado({
      projetoAprovado: false,
      assinaturaTecnicaArmazenada: null,
      verificacao: { status: "verificando" },
    });
  }

  if (cenario.janelaInicio === null || cenario.janelaFim === null) {
    console.error(
      `avaliarCenarioComercialAprovado: cenário ${cenario.id} tem assinatura_tecnica mas snapshot sem janela extraível - tratado como erro de verificação (conservador).`,
    );
    return decidirUsoCenarioComercialAprovado({
      projetoAprovado: false,
      assinaturaTecnicaArmazenada: cenario.assinaturaTecnica,
      verificacao: { status: "erro" },
    });
  }

  try {
    const dados = await buscarDadosAssinaturaTecnica(client, cenario.empresaId, projetoId, cenario.janelaInicio, cenario.janelaFim);
    const documento = construirDocumentoAssinaturaTecnica(dados);
    const assinaturaAtual = await calcularHashAssinaturaTecnica(documento);

    return decidirUsoCenarioComercialAprovado({
      projetoAprovado: false,
      assinaturaTecnicaArmazenada: cenario.assinaturaTecnica,
      verificacao: { status: "ok", assinaturaAtual },
    });
  } catch (erroCapturado) {
    // Comportamento CONSERVADOR (regra explícita do usuário): qualquer
    // falha ao carregar/calcular a assinatura ao vivo nunca trata o
    // cenário como vigente por omissão - cai para desatualizado,
    // mesmo caminho de uma divergência confirmada.
    console.error(
      `avaliarCenarioComercialAprovado: falha ao recalcular a assinatura técnica do cenário ${cenario.id} - ${erroCapturado instanceof Error ? erroCapturado.message : String(erroCapturado)}`,
    );
    return decidirUsoCenarioComercialAprovado({
      projetoAprovado: false,
      assinaturaTecnicaArmazenada: cenario.assinaturaTecnica,
      verificacao: { status: "erro" },
    });
  }
}
