// Rota dedicada de usuário INATIVO (C2.4-P1). Página estática, sem
// nenhuma lógica: não chama nenhuma RPC, não lê nem altera sessão, não
// tenta reativar o usuário. Esta rota é isenta das duas checagens do
// proxy.ts (vínculo + atividade), para nunca entrar em loop de
// redirecionamento — recarregar esta página NÃO reexecuta nenhuma
// verificação. Estado semanticamente distinto de "vínculo inconsistente"
// (estrutura de identidade/empresa incoerente): aqui o vínculo pode
// estar perfeitamente coerente, mas o acesso foi encerrado.
export default function UsuarioInativoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 text-center text-text-secondary">
      <div className="flex max-w-sm flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Seu acesso foi encerrado</p>
        <p className="text-sm font-medium">
          Sua conta nesta empresa está inativa. Entre em contato com o administrador da sua
          empresa se acredita que isso é um engano.
        </p>
      </div>
    </main>
  );
}
