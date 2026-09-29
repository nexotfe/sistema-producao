// Rota dedicada de FALHA TÉCNICA ao verificar consistência do vínculo
// operacional (Administração Segura de Usuários — ETAPA U9-A). Página
// estática, sem nenhuma lógica: não chama a RPC, não lê nem altera
// sessão. Nesta rota, a própria rota é isenta da checagem de vínculo no
// desenho futuro do proxy.ts (para impedir loop de redirecionamento) —
// por isso, recarregar esta página NÃO reexecuta nenhuma verificação. Um
// mecanismo real de retry (levar de volta à rota protegida original,
// não a esta) é definido só na integração futura com proxy.ts, ainda
// não implementada.
export default function VerificacaoIndisponivelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-text-secondary">
      <div className="flex max-w-sm flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Não foi possível verificar seu acesso</p>
        <p className="text-sm font-medium">
          Estamos com uma instabilidade temporária ao verificar seu acesso. Tente novamente em
          instantes.
        </p>
      </div>
    </main>
  );
}
