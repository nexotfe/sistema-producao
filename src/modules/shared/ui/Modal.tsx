"use client";

import { useEffect, type ReactNode } from "react";

type ModalSize = "sm" | "lg" | "full";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "sm" (default, inalterado) = max-w-[420px]. "lg" = diálogo mais largo (formulários). "full" = quase tela cheia, altura travada em 92vh - o conteúdo interno cuida da própria rolagem (nunca cresce a página por trás). */
  size?: ModalSize;
};

const CLASSES_POR_TAMANHO: Record<ModalSize, string> = {
  sm: "w-full max-w-[420px]",
  lg: "w-full max-w-[720px]",
  full: "w-[96vw] h-[92vh] max-w-none flex flex-col",
};

/**
 * Esqueleto de referencia: IMP-SoftDelete.md secao 5.
 */
export function Modal({ open, onClose, title, children, footer, size = "sm" }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      // PAD-006 nao define um token de overlay/scrim (so tokens de
      // superficie, que invertem entre claro/escuro). Overlay de modal
      // e convencionalmente um veu escuro fixo, independente do tema -
      // valor literal aqui e um gap conhecido a levar para o PAD-006.
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,6,15,0.5)] p-5"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={[
          CLASSES_POR_TAMANHO[size],
          "overflow-hidden rounded-2xl border border-border bg-surface-elevated",
        ].join(" ")}
      >
        <div className="border-b border-border-subtle px-[22px] py-[18px]">
          <h3 className="text-[15px] font-semibold text-text-primary">{title}</h3>
        </div>

        <div
          className={[
            "text-[13px] leading-[1.6] text-text-secondary",
            size === "full" ? "flex-1 overflow-hidden px-[22px] py-4" : "px-[22px] py-5",
          ].join(" ")}
        >
          {children}
        </div>

        {footer ? (
          <div className="flex justify-end gap-2.5 border-t border-border-subtle px-[22px] py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
