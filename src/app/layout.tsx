import type { Metadata } from "next";
import { AuthGate } from "@/modules/auth/AuthGate";
import { NavigationHistoryTracker } from "@/modules/shared/navigation/NavigationHistoryTracker";
import { themeInitScript } from "@/modules/shared/theme/initThemeScript";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sistema de Producao",
  description: "Gestao de projetos, OFs, OPs e fila de producao.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/*
          PAD-006 — este script deve permanecer no <head>, antes de
          qualquer componente visual. Não mover para <body> ou para depois
          de outro conteúdo — o posicionamento atual foi validado
          experimentalmente (Playwright, data-theme aplicado em ~23ms vs.
          first-paint em ~84ms). Mover este script reintroduz risco de
          flash de tema sem aviso.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <NavigationHistoryTracker />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
