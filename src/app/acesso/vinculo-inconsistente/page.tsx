// Rota dedicada de inconsistência ESTRUTURAL do vínculo operacional
// (Administração Segura de Usuários — ETAPA U9-A). Página estática, sem
// nenhuma lógica: não chama a RPC de consistência, não lê nem altera
// sessão, não tenta corrigir o estado. A integração real com proxy.ts
// (que decide QUANDO redirecionar para cá) é etapa futura, ainda não
// implementada.
export default function VinculoInconsistentePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-text-secondary">
      <div className="flex max-w-sm flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Não foi possível liberar seu acesso</p>
        <p className="text-sm font-medium">
          Sua sessão foi autenticada, mas há uma inconsistência na configuração da sua conta nesta
          empresa. Entre em contato com o administrador da sua empresa para regularizar seu acesso.
        </p>
      </div>
    </main>
  );
}
