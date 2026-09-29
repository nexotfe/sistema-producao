// Next.js 16 renomeou o arquivo de convenção "middleware" para "proxy"
// (middleware.ts ainda funciona, mas emite aviso de depreciação neste
// projeto - confirmado em node_modules/next/dist/.../setup-dev-bundler.js).
// Mesma API (NextRequest/NextResponse), só muda o nome do arquivo e do
// export esperado (`proxy` em vez de `middleware`).
//
// Revalida a sessao no servidor (auth.getUser(), nunca getSession() -
// getUser() bate no Supabase Auth; getSession() so decodifica o cookie
// local, que pode estar presente mas invalido/expirado) e bloqueia
// acesso a qualquer rota interna sem sessao valida ANTES de qualquer
// Server Component rodar - fecha o vazamento que existia em
// src/app/ordens/[id]/page.tsx, que hoje consulta o banco no servidor
// sem nenhuma checagem de autenticacao.
//
// Administração Segura de Usuários (U9-B): além da sessão, toda rota
// autenticada protegida (não isenta) passa por
// resolver_consistencia_vinculo_operacional_atual() - checagem
// ESTRUTURAL (profiles+usuarios existem, mesmo id, empresa/nivel
// coerentes), nunca de atividade/autorização. Duas rotas isentas dessa
// checagem (nunca chamam a RPC, para nunca entrar em loop de
// redirecionamento): a rota de destino de "inconsistente" e a rota de
// destino de "erro técnico" - cada uma em sua própria coleção, mesmo
// tendo o mesmo efeito de pular a chamada, porque representam estados
// semanticamente diferentes (inconsistência comprovada vs.
// impossibilidade de verificar). Qualquer falha técnica na chamada
// (error retornado, exceção lançada, ou retorno fora do contrato
// conhecido) é fail-closed - nunca libera navegação.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Apenas "/" (a propria pagina de login) e publica - comparacao exata,
// nunca prefixo/startsWith, para nao abrir sem querer nenhuma rota tipo
// "/produtos" por engano de match parcial.
const PUBLIC_PATHS = new Set(["/"]);

const ROTA_VINCULO_INCONSISTENTE = "/acesso/vinculo-inconsistente";
const ROTA_VERIFICACAO_INDISPONIVEL = "/acesso/verificacao-indisponivel";

// Duas coleções separadas, deliberadamente não fundidas - ver
// comentário do cabeçalho: mesmo efeito operacional (pular a RPC),
// motivos semanticamente distintos.
const ESTRUTURAL_EXEMPT_PATHS = new Set([ROTA_VINCULO_INCONSISTENTE]);
const TECNICO_EXEMPT_PATHS = new Set([ROTA_VERIFICACAO_INDISPONIVEL]);

// Único ponto que constrói um redirect preservando cookies renovados -
// usado pelos 3 redirects deste arquivo (sessão ausente, vínculo
// inconsistente, falha técnica). Sem isso, um refresh de token que
// coincida com qualquer um desses redirecionamentos seria perdido.
function redirecionarPreservandoCookies(
  pathname: string,
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = pathname;
  redirectUrl.search = "";

  const redirectResponse = NextResponse.redirect(redirectUrl);
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  return redirectResponse;
}

export async function proxy(request: NextRequest) {
  // Resposta base: encaminha a requisicao adiante. E reatribuida dentro
  // de setAll sempre que o Supabase renovar cookies (refresh de token),
  // para que os cookies renovados sigam tanto no request (downstream)
  // quanto na response devolvida ao navegador.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Erro ao revalidar (token invalido/expirado/rede) ou ausencia de
  // usuario contam igualmente como nao autenticado - nunca deixar
  // passar por omissao.
  const isAuthenticated = !error && user !== null;
  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.has(pathname);

  if (!isAuthenticated && !isPublicPath) {
    return redirecionarPreservandoCookies("/", request, response);
  }

  const isRotaEstruturalIsenta = ESTRUTURAL_EXEMPT_PATHS.has(pathname);
  const isRotaTecnicaIsenta = TECNICO_EXEMPT_PATHS.has(pathname);

  if (isAuthenticated && !isPublicPath && !isRotaEstruturalIsenta && !isRotaTecnicaIsenta) {
    // INSTRUMENTAÇÃO TEMPORÁRIA - ver decisão de manutenção/remoção no
    // entregável da ETAPA U9-B. Mede só a duração da chamada e a
    // categoria do resultado - nunca o pathname (várias rotas
    // protegidas são dinâmicas e carregariam identificador de negócio,
    // ex. /produtos/[pn], desnecessário para medir a latência da RPC).
    // Condicionada a ambiente não produtivo (ETAPA U9-C) - nunca emite
    // esse log em produção.
    const instrumentacaoAtiva = process.env.NODE_ENV !== "production";
    const inicioMedicao = performance.now();

    let vinculo: unknown = null;
    let erroVinculo: unknown = null;
    let categoriaResultado: "coerente" | "inconsistente" | "erro" | "inesperado";

    try {
      const resultado = await supabase.rpc("resolver_consistencia_vinculo_operacional_atual");
      vinculo = resultado.data;
      erroVinculo = resultado.error;
    } catch {
      // Exceção lançada durante a própria chamada (ex.: rede) - fail-closed.
      categoriaResultado = "erro";
      if (instrumentacaoAtiva) {
        console.log(
          `[proxy][vinculo] duracaoMs=${(performance.now() - inicioMedicao).toFixed(1)} resultado=${categoriaResultado}`,
        );
      }
      return redirecionarPreservandoCookies(ROTA_VERIFICACAO_INDISPONIVEL, request, response);
    }

    if (erroVinculo) {
      categoriaResultado = "erro";
      if (instrumentacaoAtiva) {
        console.log(
          `[proxy][vinculo] duracaoMs=${(performance.now() - inicioMedicao).toFixed(1)} resultado=${categoriaResultado}`,
        );
      }
      return redirecionarPreservandoCookies(ROTA_VERIFICACAO_INDISPONIVEL, request, response);
    }

    if (vinculo === "coerente") {
      categoriaResultado = "coerente";
      if (instrumentacaoAtiva) {
        console.log(
          `[proxy][vinculo] duracaoMs=${(performance.now() - inicioMedicao).toFixed(1)} resultado=${categoriaResultado}`,
        );
      }
      return response;
    }

    if (vinculo === "inconsistente") {
      categoriaResultado = "inconsistente";
      if (instrumentacaoAtiva) {
        console.log(
          `[proxy][vinculo] duracaoMs=${(performance.now() - inicioMedicao).toFixed(1)} resultado=${categoriaResultado}`,
        );
      }
      return redirecionarPreservandoCookies(ROTA_VINCULO_INCONSISTENTE, request, response);
    }

    // null, undefined ou qualquer valor não reconhecido, sem error - fail-closed.
    categoriaResultado = "inesperado";
    if (instrumentacaoAtiva) {
      console.log(
        `[proxy][vinculo] duracaoMs=${(performance.now() - inicioMedicao).toFixed(1)} resultado=${categoriaResultado}`,
      );
    }
    return redirecionarPreservandoCookies(ROTA_VERIFICACAO_INDISPONIVEL, request, response);
  }

  return response;
}

export const config = {
  // Exclui apenas recursos tecnicos/estaticos do Next e arquivos com
  // extensao de asset - toda rota de aplicacao passa pelo proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
