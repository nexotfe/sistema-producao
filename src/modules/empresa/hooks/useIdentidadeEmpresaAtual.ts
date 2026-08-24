"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buscarIdentidadeEmpresaAtual, type IdentidadeEmpresa } from "../lib/buscarIdentidadeEmpresaAtual";

export type EstadoIdentidadeEmpresa =
  | { status: "carregando" }
  | { status: "ok"; identidade: IdentidadeEmpresa }
  | { status: "sem_empresa" }
  | { status: "erro"; mensagem: string };

/**
 * Envelope de useState+useEffect (fetch assíncrono real, não o
 * anti-padrão de setState síncrono dentro de efeito) em torno de
 * buscarIdentidadeEmpresaAtual - mesmo padrão de "cancelado" já usado
 * em AuthGate.tsx/contextoCalendario.ts para nunca chamar setState
 * depois do componente desmontar.
 */
export function useIdentidadeEmpresaAtual(): EstadoIdentidadeEmpresa {
  const [estado, setEstado] = useState<EstadoIdentidadeEmpresa>({ status: "carregando" });

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      const resultado = await buscarIdentidadeEmpresaAtual(supabase);

      if (cancelado) {
        return;
      }

      if (resultado.status === "ok") {
        setEstado({ status: "ok", identidade: resultado.identidade });
      } else if (resultado.status === "sem_empresa") {
        setEstado({ status: "sem_empresa" });
      } else {
        setEstado({ status: "erro", mensagem: resultado.mensagem });
      }
    }

    carregar();

    return () => {
      cancelado = true;
    };
  }, []);

  return estado;
}
