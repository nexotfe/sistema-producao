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
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Apenas "/" (a propria pagina de login) e publica - comparacao exata,
// nunca prefixo/startsWith, para nao abrir sem querer nenhuma rota tipo
// "/produtos" por engano de match parcial.
const PUBLIC_PATHS = new Set(["/"]);

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
  const isPublicPath = PUBLIC_PATHS.has(request.nextUrl.pathname);

  if (!isAuthenticated && !isPublicPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";

    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Preserva no redirecionamento quaisquer cookies que o Supabase
    // tenha renovado durante a chamada a getUser() acima - sem isso,
    // um refresh de token que coincida com uma tentativa de acesso
    // negada seria perdido.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    return redirectResponse;
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
