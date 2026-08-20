// DEC-007 §6.2.7/Fase 8b (primeiro incremento) - antecipação de
// material como negociação do PROJETO (decisão de desenho registrada
// no plano): 1 data nova + 1 custo, aplicados a TODAS as
// ocorrências-raiz do projeto (1 DecisaoAntecipacaoMaterial por raiz,
// mesma data/contratação) - nunca por operação individual nesta
// entrega. calcularCustoContratacoes já garante que a mesma
// Contratacao só é cobrada 1 vez, mesmo referenciada por várias
// decisões (invariante testado em avaliarCenario.test.ts).
"use client";

import { useState } from "react";
import { Card } from "@/modules/shared/ui/Card";
import { Field } from "@/modules/shared/ui/Field";
import { Button } from "@/modules/shared/ui/Button";
import { chaveOcorrenciaParaString } from "@/modules/simulacao-comercial/lib/cenarios/chaveOcorrencia";
import type { BaseCenarios } from "@/modules/simulacao-comercial/lib/cenarios/carregarBaseCenarios";
import type { DecisoesCenario } from "@/modules/simulacao-comercial/lib/cenarios/avaliarCenario";
import type { Contratacao } from "@/modules/simulacao-comercial/lib/cenarios/contratacao";

export interface PainelAntecipacaoMaterialProps {
  base: BaseCenarios;
  onCalcular: (decisoes: DecisoesCenario) => void;
  calculando?: boolean;
}

function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function PainelAntecipacaoMaterial({ base, onCalcular, calculando }: PainelAntecipacaoMaterialProps) {
  const [dataAntecipada, setDataAntecipada] = useState("");
  const [custoTexto, setCustoTexto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Todas as raízes recebem a MESMA disponibilidadeOriginalMaterial
  // (carregarBaseCenarios.ts) - qualquer uma delas serve como
  // referência para mostrar/validar a data original ao usuário.
  const primeiraRaizStr = chaveOcorrenciaParaString(base.chavesRaizOrcamentoNovo[0]);
  const disponibilidadeOriginal = base.restricaoMaterialPorChave[primeiraRaizStr];

  function handleCalcular() {
    setErro(null);

    if (!dataAntecipada) {
      setErro("Informe a nova data de disponibilidade do material.");
      return;
    }
    if (dataAntecipada >= disponibilidadeOriginal) {
      setErro(
        `A nova data precisa ser anterior à disponibilidade atual (${formatarDataBr(disponibilidadeOriginal)}) - igual ou posterior não é uma antecipação.`,
      );
      return;
    }
    const custo = Number(custoTexto.replace(",", "."));
    if (!Number.isFinite(custo) || custo < 0) {
      setErro("Informe um custo de negociação válido (número não negativo).");
      return;
    }

    const contratacaoId = crypto.randomUUID();
    const contratacao: Contratacao = {
      id: contratacaoId,
      tipo: "antecipacao_material",
      abrangencia: "valor_fixo_unico",
      valor: custo,
      moeda: "BRL",
      fornecedorOuContratado: fornecedor.trim() || "Fornecedor não informado",
      referenciaProposta: null,
      justificativa: "Antecipação de material negociada com fornecedor.",
      datas: [],
    };

    const decisoes: DecisoesCenario = {
      capacidadeExtra: [],
      contratacoes: [contratacao],
      terceirizacoes: [],
      recursosTemporarios: [],
      antecipacoesMaterial: base.chavesRaizOrcamentoNovo.map((chave) => ({
        chave,
        dataDisponibilidadeAntecipada: dataAntecipada,
        contratacaoId,
      })),
    };

    onCalcular(decisoes);
  }

  return (
    <Card title="Antecipação de materiais">
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] text-text-secondary">
          Disponibilidade atual do material: <strong className="text-text-primary">{formatarDataBr(disponibilidadeOriginal)}</strong>.
          Negocie uma data mais cedo com o fornecedor e informe o custo dessa negociação.
        </p>

        <div className="flex flex-wrap items-start gap-3">
          <Field
            label="Nova data de disponibilidade"
            type="date"
            value={dataAntecipada}
            onChange={(event) => setDataAntecipada(event.target.value)}
            disabled={calculando}
          />
          <Field
            label="Custo da negociação (R$)"
            inputMode="decimal"
            placeholder="0,00"
            value={custoTexto}
            onChange={(event) => setCustoTexto(event.target.value)}
            disabled={calculando}
          />
          <Field
            label="Fornecedor (opcional)"
            value={fornecedor}
            onChange={(event) => setFornecedor(event.target.value)}
            disabled={calculando}
          />
        </div>

        {erro ? <p className="text-[12.5px] text-status-danger-text">{erro}</p> : null}

        <div>
          <Button onClick={handleCalcular} disabled={calculando}>
            {calculando ? "Calculando..." : "Calcular cenário ajustado"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
