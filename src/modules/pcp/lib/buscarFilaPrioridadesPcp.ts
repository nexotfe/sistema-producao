// PCP-Etapa2O.5: leitura real da fila de prioridades do PCP
// (pcp_fila_projetos), para a futura página /pcp/prioridades. Usa o
// client de SESSÃO (RLS normal), nunca service_role - mesmo princípio
// de buscarProgramacaoVigentePcp.ts. Nunca escreve nada.
//
// posicaoReal é o rank fracionário de pcp_fila_projetos.posicao, nunca
// editado aqui - exposto só para quem precisar enviá-lo de volta a
// reordenar_fila_pcp/moverPrioridadeProjetoPcpAction (vizinhos). Já
// ordenado por posicaoReal, de 1 em diante, nunca por projetos.prioridade
// (campo categórico distinto, nunca usado como substituto - regra fixada
// desde a Etapa 2O.1).
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ItemFilaPrioridadesPcp {
  readonly projetoId: string;
  readonly numeroProjeto: string;
  readonly nomeProjeto: string;
  readonly clienteId: string | null;
  readonly nomeCliente: string | null;
  readonly dataObjetivo: string | null;
  /** Rank fracionário real de pcp_fila_projetos.posicao - nunca editado aqui. */
  readonly posicaoReal: number;
  /** Só ordem visual (1, 2, 3...) - nunca grava, nunca substitui posicaoReal. */
  readonly posicaoSequencial: number;
}

export async function buscarFilaPrioridadesPcp(client: SupabaseClient): Promise<readonly ItemFilaPrioridadesPcp[]> {
  const { data: filaRows, error: erroFila } = await client
    .from("pcp_fila_projetos")
    .select("projeto_id, posicao")
    .order("posicao", { ascending: true });
  if (erroFila) throw new Error(`buscarFilaPrioridadesPcp: erro ao consultar pcp_fila_projetos: ${erroFila.message}`);

  const fila = filaRows ?? [];
  if (fila.length === 0) return [];

  const projetoIds = fila.map((linha) => linha.projeto_id as string);
  const { data: projetosRows, error: erroProjetos } = await client
    .from("projetos")
    .select("id, numero_projeto, nome, cliente_id, data_objetivo")
    .in("id", projetoIds);
  if (erroProjetos) throw new Error(`buscarFilaPrioridadesPcp: erro ao consultar projetos: ${erroProjetos.message}`);

  const projetoPorId = new Map((projetosRows ?? []).map((linha) => [linha.id as string, linha]));

  const clienteIds = Array.from(
    new Set((projetosRows ?? []).map((linha) => linha.cliente_id as string | null).filter((id): id is string => id !== null)),
  );
  const { data: clientesRows, error: erroClientes } =
    clienteIds.length > 0
      ? await client.from("clientes").select("id, nome").in("id", clienteIds)
      : { data: [], error: null };
  if (erroClientes) throw new Error(`buscarFilaPrioridadesPcp: erro ao consultar clientes: ${erroClientes.message}`);

  const nomeClientePorId = new Map((clientesRows ?? []).map((linha) => [linha.id as string, linha.nome as string]));

  return fila.map((linha, indice) => {
    const projeto = projetoPorId.get(linha.projeto_id as string);
    if (!projeto) {
      // FK garante integridade real - chegar aqui só é possível se a RLS de
      // `projetos` escondesse uma linha que a de `pcp_fila_projetos` revelou
      // (nunca deveria, mesmo tenant) - inconsistência, nunca "ausência legítima".
      throw new Error(
        `buscarFilaPrioridadesPcp: projeto ${linha.projeto_id} está na fila mas não foi encontrado na consulta de projetos.`,
      );
    }
    const clienteId = (projeto.cliente_id as string | null) ?? null;
    return {
      projetoId: projeto.id as string,
      numeroProjeto: projeto.numero_projeto as string,
      nomeProjeto: projeto.nome as string,
      clienteId,
      nomeCliente: clienteId ? nomeClientePorId.get(clienteId) ?? null : null,
      dataObjetivo: (projeto.data_objetivo as string | null) ?? null,
      posicaoReal: linha.posicao as number,
      posicaoSequencial: indice + 1,
    };
  });
}
