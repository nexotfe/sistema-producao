"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/modules/shared/ui/Button";

type UserMenuProps = {
  email: string | null | undefined;
};

// Sai so desta sessao/navegador (scope "local") - nao invalida outras
// sessoes do mesmo usuario em outros dispositivos. O proxy (src/proxy.ts)
// e' quem decide autorizacao de rota; este componente so cuida da
// experiencia (mostrar quem esta logado, permitir sair, dar feedback).
export function UserMenu({ email }: UserMenuProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setErrorMessage(null);
    setIsSigningOut(true);

    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      setIsSigningOut(false);
      setErrorMessage("Não foi possível sair. Tente novamente.");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-3 border-b border-border bg-surface px-5 py-2 text-[13px]">
      <span className="text-text-secondary">{email ?? "Usuário autenticado"}</span>
      <Button
        variant="secondary"
        onClick={handleSignOut}
        disabled={isSigningOut}
        aria-busy={isSigningOut}
      >
        {isSigningOut ? "Saindo..." : "Sair"}
      </Button>
      {errorMessage ? (
        <span role="alert" className="text-status-danger-text">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
