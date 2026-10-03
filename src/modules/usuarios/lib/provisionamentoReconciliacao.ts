import "server-only";
// Helpers de reconciliação (GA-4C2.3-E2, seções 11/17-19) - usados
// SÓ quando uma chamada ao Auth/RPC não retorna resposta conclusiva
// (a Promise rejeita, nunca quando ela resolve com {error}, que já é
// resposta conclusiva e é tratada direto no orquestrador). Nunca
// apagam nada sozinhos - só respondem "qual é o estado real agora".
import type { SupabaseClient } from "@supabase/supabase-js";

const LIMITE_PAGINAS_BUSCA_AUTH = 50; // teto de segurança (50 x 200 = 10000 usuários) - nunca laço infinito.
const TAMANHO_PAGINA_BUSCA_AUTH = 200;

export type ResultadoBuscaAuthPorIdentidade =
  | { resultado: "encontrado"; authUserId: string }
  | { resultado: "nao_encontrado" }
  | { resultado: "inconclusivo" };

// Não existe, no supabase-js, um "getUserByEmail" na Admin API - o
// único jeito documentado de localizar por e-mail é paginar
// auth.admin.listUsers() e filtrar no cliente. Como esta função só
// roda no caminho raro de timeout (nunca no caminho feliz), paginar
// integralmente prioriza correção sobre velocidade; o teto acima evita
// loop sem fim numa base muito grande.
export async function buscarAuthUserPorIdentidadeTecnica(
  serviceClient: SupabaseClient,
  identidadeTecnica: string,
): Promise<ResultadoBuscaAuthPorIdentidade> {
  try {
    for (let page = 1; page <= LIMITE_PAGINAS_BUSCA_AUTH; page += 1) {
      const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: TAMANHO_PAGINA_BUSCA_AUTH });

      if (error) {
        return { resultado: "inconclusivo" };
      }

      const encontrados = data.users.filter((u) => u.email === identidadeTecnica);

      if (encontrados.length > 1) {
        // Nunca deveria ocorrer (identidade técnica é única por
        // construção) - tratar como inconclusivo, nunca escolher um.
        return { resultado: "inconclusivo" };
      }

      if (encontrados.length === 1) {
        return { resultado: "encontrado", authUserId: encontrados[0].id };
      }

      if (data.users.length < TAMANHO_PAGINA_BUSCA_AUTH) {
        return { resultado: "nao_encontrado" };
      }
    }

    return { resultado: "inconclusivo" };
  } catch {
    return { resultado: "inconclusivo" };
  }
}

export type ResultadoReconciliacaoEstado =
  | { estado: "coerente"; empresaId: string }
  | { estado: "nenhum" }
  | { estado: "parcial"; empresaId: string | null }
  | { estado: "inconclusivo"; empresaId: null };

// Estados A/B/C da seção 18: A = profiles+usuarios existem e
// concordam (empresa/nível) e o profile já tem grupo_id preenchido;
// B = nenhum dos dois existe; C = qualquer outra combinação
// (só um existe, ou os dois existem mas divergem).
//
// "inconclusivo" é distinto de "parcial": "parcial" significa que a
// leitura funcionou e os dados reais estão incoerentes; "inconclusivo"
// significa que nem foi possível ler o estado real (erro na própria
// consulta). O orquestrador trata os dois da mesma forma com relação a
// segurança (nunca apaga o Auth em nenhum dos dois - só "nenhum"
// autoriza exclusão), mas o estado em si não é mais colapsado num só
// rótulo, para não mascarar falha de leitura como incoerência de dado.
export async function reconciliarEstadoProvisionamento(
  serviceClient: SupabaseClient,
  authUserId: string,
): Promise<ResultadoReconciliacaoEstado> {
  const [profileResult, usuarioResult] = await Promise.all([
    serviceClient.from("profiles").select("id, empresa_id, nivel_acesso, grupo_id").eq("id", authUserId).maybeSingle(),
    serviceClient.from("usuarios").select("id, empresa_id, nivel_acesso").eq("id", authUserId).maybeSingle(),
  ]);

  if (profileResult.error || usuarioResult.error) {
    return { estado: "inconclusivo", empresaId: null };
  }

  const profile = profileResult.data as { empresa_id: string; nivel_acesso: string; grupo_id: string | null } | null;
  const usuario = usuarioResult.data as { empresa_id: string; nivel_acesso: string } | null;

  if (!profile && !usuario) {
    return { estado: "nenhum" };
  }

  if (
    profile &&
    usuario &&
    profile.empresa_id === usuario.empresa_id &&
    profile.nivel_acesso === usuario.nivel_acesso &&
    profile.grupo_id !== null
  ) {
    return { estado: "coerente", empresaId: profile.empresa_id };
  }

  return { estado: "parcial", empresaId: profile?.empresa_id ?? usuario?.empresa_id ?? null };
}
