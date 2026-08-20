// DEC-007 §6.2/Fase 8b (redesenho: página compacta) - cartão pequeno e
// genérico reaproveitado pelos 4 cartões de configuração (Capacidade e
// recursos, Materiais, Terceirização, Resumo financeiro): título +
// resumo (via children) + botão "Configurar". Fica local a
// components/cenarios/ por ora (PAD-007 §5 reservaria isto para
// shared/ui/ só quando outro módulo também precisar do mesmo padrão -
// não promovido ainda, decisão de escopo mínimo).
import { Card } from "@/modules/shared/ui/Card";
import { Button } from "@/modules/shared/ui/Button";
import type { ReactNode } from "react";

export interface CartaoConfiguracaoProps {
  titulo: string;
  children: ReactNode;
  onConfigurar?: () => void;
  desabilitado?: boolean;
  /** Explica por que o botão está desabilitado (ex.: "Ainda não implementado nesta fase") - nunca implícito. */
  motivoDesabilitado?: string;
  rotuloBotao?: string;
}

export function CartaoConfiguracao({
  titulo,
  children,
  onConfigurar,
  desabilitado,
  motivoDesabilitado,
  rotuloBotao = "Configurar",
}: CartaoConfiguracaoProps) {
  return (
    <Card title={titulo}>
      <div className="flex flex-col gap-3">
        <div className="text-[13px] leading-[1.6] text-text-secondary">{children}</div>
        <div title={desabilitado ? motivoDesabilitado : undefined}>
          <Button variant="secondary" onClick={onConfigurar} disabled={desabilitado}>
            {rotuloBotao}
          </Button>
        </div>
      </div>
    </Card>
  );
}
