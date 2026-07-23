import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens legados — mantidos intactos, sem ligação com o CSS var
        // novo, para nenhuma tela existente mudar de aparencia nesta fase.
        "app-bg": "#EDF1F5",
        "app-card": "#FAFBFC",

        // Tokens semanticos do Design System (PAD-006) — reativos ao tema
        // via CSS custom properties. Sem consumidor ate a Fase 2.
        background: "var(--color-background)",
        surface: "var(--color-surface)",
        "surface-elevated": "var(--color-surface-elevated)",
        border: "var(--color-border)",
        "border-subtle": "var(--color-border-subtle)",
        "text-primary": "var(--color-text-primary)",
        "text-secondary": "var(--color-text-secondary)",
        "text-disabled": "var(--color-text-disabled)",
        "action-primary": "var(--color-action-primary)",
        "action-primary-hover": "var(--color-action-primary-hover)",
        "action-primary-text": "var(--color-action-primary-text)",
        "focus-ring": "var(--color-focus-ring)",
        "status-success-text": "var(--color-success-text)",
        "status-success-bg": "var(--color-success-bg)",
        "status-success-border": "var(--color-success-border)",
        "status-warning-text": "var(--color-warning-text)",
        "status-warning-bg": "var(--color-warning-bg)",
        "status-warning-border": "var(--color-warning-border)",
        "status-danger-text": "var(--color-danger-text)",
        "status-danger-bg": "var(--color-danger-bg)",
        "status-danger-border": "var(--color-danger-border)",
        "status-info-text": "var(--color-info-text)",
        "status-info-bg": "var(--color-info-bg)",
        "status-info-border": "var(--color-info-border)",
      },
    },
  },
  plugins: [],
};

export default config;
