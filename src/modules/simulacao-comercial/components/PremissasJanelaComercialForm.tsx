// DEC-007 §6.2/Fase 8b (primeiro incremento) - as MESMAS 3 premissas
// comerciais já usadas em SimulacaoCapacidade.tsx (Data de Necessidade,
// Margem de Segurança, Data Prevista de Aprovação do Pedido), extraídas
// para um componente controlado e sem estado próprio, para a tela de
// Cenários poder usá-las sem duplicar a UI (a fórmula em si -
// `prepararJanelaComercial`/`calcularJanelaComercialParaExibicao` - já
// era compartilhada; só a UI de entrada não existia como componente
// isolado). Fica pronto para SimulacaoCapacidade.tsx adotar depois,
// mas essa migração não é feita aqui - fora do pedido desta entrega.
import { Field } from "@/modules/shared/ui/Field";

export interface PremissasJanelaComercialFormProps {
  dataNecessidade: string;
  onDataNecessidadeChange: (valor: string) => void;
  margemSegurancaDiasTexto: string;
  onMargemSegurancaDiasTextoChange: (valor: string) => void;
  margemSegurancaValida: boolean;
  dataPrevistaAprovacaoPedido: string;
  onDataPrevistaAprovacaoPedidoChange: (valor: string) => void;
  disabled?: boolean;
}

export function PremissasJanelaComercialForm({
  dataNecessidade,
  onDataNecessidadeChange,
  margemSegurancaDiasTexto,
  onMargemSegurancaDiasTextoChange,
  margemSegurancaValida,
  dataPrevistaAprovacaoPedido,
  onDataPrevistaAprovacaoPedidoChange,
  disabled,
}: PremissasJanelaComercialFormProps) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <Field
        label="Data de Necessidade"
        type="date"
        hint="Data em que o cliente precisa receber o pedido pronto."
        value={dataNecessidade}
        onChange={(event) => onDataNecessidadeChange(event.target.value)}
        disabled={disabled}
      />
      <Field
        label="Margem de Segurança (dias produtivos)"
        inputMode="numeric"
        hint="Dias produtivos de folga interna, descontados antes da Data de Necessidade."
        value={margemSegurancaDiasTexto}
        onChange={(event) => onMargemSegurancaDiasTextoChange(event.target.value)}
        error={margemSegurancaDiasTexto && !margemSegurancaValida ? "Precisa ser um número inteiro não negativo." : undefined}
        disabled={disabled}
      />
      <Field
        label="Data Prevista de Aprovação do Pedido"
        type="date"
        hint="Quando você estima que o cliente vai confirmar o pedido."
        value={dataPrevistaAprovacaoPedido}
        onChange={(event) => onDataPrevistaAprovacaoPedidoChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
