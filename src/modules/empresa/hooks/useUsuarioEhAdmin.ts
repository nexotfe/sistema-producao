"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { verificarUsuarioEhAdmin } from "../lib/verificarUsuarioEhAdmin";

export type EstadoUsuarioEhAdmin =
  | { status: "carregando" }
  | { status: "ok"; ehAdmin: boolean }
  | { status: "erro"; mensagem: string };

/**
 * Mesmo padrão "cancelado" de useIdentidadeEmpresaAtual.ts. Usado só
 * para decidir o que renderizar (editar vs. somente leitura) - a
 * barreira real de permissão é a RLS no banco, não este hook.
 */
export function useUsuarioEhAdmin(): EstadoUsuarioEhAdmin {
  const [estado, setEstado] = useState<EstadoUsuarioEhAdmin>({ status: "carregando" });

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      try {
        const ehAdmin = await verificarUsuarioEhAdmin(supabase);

        if (!cancelado) {
          setEstado({ status: "ok", ehAdmin });
        }
      } catch (err) {
        if (!cancelado) {
          setEstado({
            status: "erro",
            mensagem: err instanceof Error ? err.message : "Erro ao verificar permissão do usuário.",
          });
        }
      }
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, []);

  return estado;
}
