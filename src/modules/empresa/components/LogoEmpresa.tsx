"use client";

import { useState } from "react";

type TamanhoLogo = "sm" | "md";

const CLASSES_TAMANHO: Record<TamanhoLogo, string> = {
  sm: "h-11 w-11",
  md: "h-14 w-14",
};

type LogoEmpresaProps = {
  logoUrl: string | null;
  nomeEmpresa: string;
  size?: TamanhoLogo;
  className?: string;
};

/**
 * Componente compartilhado de logo da empresa - usado na Central e na
 * Proposta Comercial (tela e impressão, mesmo componente). Sempre
 * reserva o mesmo espaço (h-11/h-14, w igual), com ou sem logo real,
 * para não deslocar o layout ao redor enquanto carrega ou quando não
 * há logo cadastrada.
 *
 * Três estados possíveis além de "sem logoUrl": carregando (bloco
 * neutro, sem "LOGO" ainda - evita mostrar o fallback por um instante
 * antes da imagem real aparecer), carregada (a imagem), erro de rede/
 * URL quebrada (mesmo fallback "LOGO" de quando não há logo).
 */
export function LogoEmpresa({ logoUrl, nomeEmpresa, size = "sm", className }: LogoEmpresaProps) {
  const [estado, setEstado] = useState<"carregando" | "carregada" | "erro">(
    logoUrl ? "carregando" : "erro",
  );

  const classesBase = [
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-border-subtle",
    CLASSES_TAMANHO[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (!logoUrl || estado === "erro") {
    return (
      <div className={classesBase}>
        <span className="text-xs font-bold text-text-disabled">LOGO</span>
      </div>
    );
  }

  return (
    <div className={classesBase}>
      {/* eslint-disable-next-line @next/next/no-img-element -- URL pública externa (Supabase Storage); next/image exigiria configurar remotePatterns, fora de escopo desta entrega. */}
      <img
        src={logoUrl}
        alt={nomeEmpresa}
        onLoad={() => setEstado("carregada")}
        onError={() => setEstado("erro")}
        className={[
          "h-full w-full object-contain",
          estado === "carregando" ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
    </div>
  );
}
