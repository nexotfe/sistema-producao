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

  // Ajuste de estado durante o render (mesmo padrão já usado em
  // proposta-comercial/page.tsx) - sem useEffect: o valor inicial do
  // useState acima só roda na montagem, então sem isto o componente
  // ficaria travado no estado de quando montou (ex.: monta sem logo,
  // "erro"/fallback; logoUrl muda para uma URL real depois - primeiro
  // upload de uma empresa sem logo, mesma sessão - e o componente nunca
  // mostraria a imagem nova). Só reseta quando logoUrl de fato muda
  // (comparação com o valor anterior evita re-render em loop e evita
  // resetar "carregada"/"erro" à toa quando o valor não mudou).
  const [logoUrlAnterior, setLogoUrlAnterior] = useState(logoUrl);
  if (logoUrl !== logoUrlAnterior) {
    setLogoUrlAnterior(logoUrl);
    setEstado(logoUrl ? "carregando" : "erro");
  }

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
