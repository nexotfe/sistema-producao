// Route Handler de provisionamento de usuário com Grupo de Acesso
// (GA-4C2.3-E2). Primeira rota de API deste projeto (src/app/api não
// existia antes) - POST /api/usuarios, convenção REST: substantivo do
// recurso já usado em todo o schema (usuarios/profiles), POST=criação.
// Não é Server Action porque este fluxo tem múltiplas chamadas externas
// (Auth Admin API + RPC), compensação condicional e precisa de um
// envelope de erro/status HTTP controlado - mais próximo de uma API
// interna do que de uma mutação simples ligada a um formulário.
//
// Só monta os dois clients reais e delega toda a lógica a
// provisionarUsuarioComGrupo (src/modules/usuarios/actions), via o
// adaptador em provisionamentoAdaptadoresSupabase - mesma separação já
// usada pelos orquestradores de simulacao-comercial.
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { createSupabaseServiceClient } from "@/lib/supabaseServiceClient";
import { provisionarUsuarioComGrupo, type PayloadProvisionamentoBruto } from "@/modules/usuarios/actions/provisionarUsuarioComGrupo";
import { criarDependenciasReaisProvisionamento } from "@/modules/usuarios/lib/provisionamentoAdaptadoresSupabase";
import { CODIGOS_ERRO_PROVISIONAMENTO } from "@/modules/usuarios/lib/provisionamentoErros";

export async function POST(request: NextRequest) {
  let payload: PayloadProvisionamentoBruto;
  try {
    payload = (await request.json()) as PayloadProvisionamentoBruto;
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: CODIGOS_ERRO_PROVISIONAMENTO.ENTRADA_INVALIDA, message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  // Extração seletiva - nunca spread do body. Qualquer campo além
  // destes três (empresaId, nivelAcesso, ativo, criadoPor, authUserId,
  // identidadeTecnica, serviceRole, origem, grupoEraAdm etc.) nunca é
  // lido, nunca é passado adiante.
  const payloadSanitizado: PayloadProvisionamentoBruto = {
    nome: payload?.nome,
    emailComercial: payload?.emailComercial,
    grupoId: payload?.grupoId,
  };

  const sessionClient = await createSupabaseServerClient();
  const serviceClient = createSupabaseServiceClient();
  const deps = criarDependenciasReaisProvisionamento(sessionClient, serviceClient);

  const resultado = await provisionarUsuarioComGrupo(deps, payloadSanitizado);

  if (resultado.ok) {
    return NextResponse.json({ ok: true, usuarioId: resultado.usuarioId }, { status: resultado.status });
  }

  return NextResponse.json({ ok: false, error: resultado.error }, { status: resultado.status });
}
