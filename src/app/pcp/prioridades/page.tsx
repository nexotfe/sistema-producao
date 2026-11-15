// PCP-B1-HORIZONTE: página SERVIDOR mínima - só existe para que
// `export const maxDuration` seja de fato reconhecido pelo Next.js/Vercel
// para esta rota e suas Server Actions (route segment config só é lido
// de um segmento SERVIDOR - nunca de um arquivo "use client", onde esta
// declaração vivia antes sem efeito real). Toda a UI/lógica/estado
// permanece intocada em PrioridadesPcpPageClient.tsx (client component),
// só renderizada aqui.
export const maxDuration = 300;

import PrioridadesPcpPageClient from "./PrioridadesPcpPageClient";

export default function PrioridadesPcpPage() {
  return <PrioridadesPcpPageClient />;
}
