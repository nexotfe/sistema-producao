import type { Metadata } from "next";
import { AuthGate } from "@/modules/auth/AuthGate";
import { NavigationHistoryTracker } from "@/modules/shared/navigation/NavigationHistoryTracker";
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
    <html lang="pt-BR">
      <body>
        <NavigationHistoryTracker />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
