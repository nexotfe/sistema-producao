// Porta de validação material antes do cálculo de capacidade -
// reutiliza gerarListaTecnicaProjeto.ts (módulo de Projetos), já
// entregue e testado, em vez de chamar a RPC gerar_lista_tecnica_projeto
// diretamente por aqui - a interpretação do retorno (estado/mensagem)
// mora numa única camada, não duplicada.
//
// industrialização (estado "nao_aplicavel_industrializacao") NÃO
// bloqueia aqui - material é fornecido pelo cliente. A completude
// OPERACIONAL do roteiro (subconjunto sem BOM) continua exigida
// independente da natureza do projeto, mas isso é responsabilidade de
// coletarEstruturaBom.ts (chamado separadamente), não desta função.
//
// O retorno de gerarListaTecnicaProjeto (materiais/itensAnalisados) é
// descartado por completo - usado só para decidir bloquear ou não;
// nada disso persiste em nenhum snapshot de simulação.
//
// Sem "use client": recebe o client Supabase por parâmetro, portável
// entre preview no navegador e revalidação autoritativa no servidor -
// mesmo padrão de todo o resto deste módulo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarListaTecnicaProjeto } from "@/modules/projetos/lib/gerarListaTecnicaProjeto";
import { EstruturaFabricacaoIncompletaError } from "./errors";

export async function validarEstruturaFabricacaoProjeto(
  client: SupabaseClient,
  projetoId: string,
): Promise<void> {
  try {
    await gerarListaTecnicaProjeto(client, projetoId);
    // Sucesso = estado "calculado" ou "nao_aplicavel_industrializacao"
    // (os únicos dois valores que gerarListaTecnicaProjeto devolve sem
    // lançar) - ambos são válidos para prosseguir com o cálculo de
    // capacidade.
  } catch (erro) {
    throw new EstruturaFabricacaoIncompletaError(
      projetoId,
      erro instanceof Error
        ? erro.message
        : "Não foi possível validar a estrutura de fabricação do projeto.",
    );
  }
}
