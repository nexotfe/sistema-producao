import { useSyncExternalStore } from "react";

function calcularSaudacao(hora: number): string {
  if (hora >= 5 && hora < 12) return "Bom dia!";
  if (hora >= 12 && hora < 18) return "Boa tarde!";
  return "Boa noite!";
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatarDataPorExtenso(data: Date): string {
  const formatado = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data);
  return capitalizar(formatado);
}

type CabecalhoTemporal = { saudacao: string; dataExtenso: string };

const CABECALHO_SERVIDOR: CabecalhoTemporal = { saudacao: "Bem-vindo", dataExtenso: "" };

// useSyncExternalStore (mesmo padrão de ThemeToggle.tsx) em vez de
// useState+useEffect: saudação/data só existem no navegador (hora
// local) e precisam de um snapshot estável no servidor, sem setState
// dentro de efeito.
let cabecalhoCache: CabecalhoTemporal | null = null;

function getCabecalhoSnapshot(): CabecalhoTemporal {
  if (cabecalhoCache === null) {
    const agora = new Date();
    cabecalhoCache = {
      saudacao: calcularSaudacao(agora.getHours()),
      dataExtenso: formatarDataPorExtenso(agora),
    };
  }
  return cabecalhoCache;
}

function subscribeCabecalho() {
  return () => {};
}

function getCabecalhoServidor(): CabecalhoTemporal {
  return CABECALHO_SERVIDOR;
}

export function useCabecalhoTemporal(): CabecalhoTemporal {
  return useSyncExternalStore(subscribeCabecalho, getCabecalhoSnapshot, getCabecalhoServidor);
}
