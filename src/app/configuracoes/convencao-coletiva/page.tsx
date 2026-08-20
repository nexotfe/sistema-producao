// DEC-007 §6.2/Fase 8b (redesenho: convenção coletiva) - tela
// administrativa dos percentuais de acréscimo de hora adicional
// (segunda a sexta/sábado/domingo/feriado), globais por empresa, com
// vigência histórica real. Toda escrita passa pela RPC
// `registrar_convencao_horas_adicionais` (migration 202608130001) - só
// admin (`usuario_e_admin()`, verificado no banco, não há verificação
// de papel no cliente neste app hoje - mesmo padrão já usado em
// useCompatibilidadesRecurso.ts: tenta a ação, mostra a mensagem de
// erro da RLS/RPC se não tiver permissão, nunca esconde o formulário
// preventivamente).
//
// Leitura "vigente hoje" NUNCA usa o atalho "linha com vigente_ate is
// null" (essa pode ser uma vigência já agendada para o futuro) - sempre
// via a RPC `convencoes_horas_adicionais_no_periodo`, chamada com
// data_inicio=data_fim=hoje.
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ModuleBackLink } from "@/modules/shared/navigation/ModuleBackLink";
import { Card } from "@/modules/shared/ui/Card";
import { Field } from "@/modules/shared/ui/Field";
import { Button } from "@/modules/shared/ui/Button";
import { converterPercentualParaFracao } from "@/modules/simulacao-comercial/lib/cenarios/converterPercentualParaFracao";

interface ConvencaoRow {
  id: string;
  percentual_segunda_sexta: number;
  percentual_sabado: number;
  percentual_domingo: number;
  percentual_feriado: number;
  vigente_desde: string;
  vigente_ate: string | null;
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatarDataBr(dataIso: string | null): string {
  if (!dataIso) return "—";
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarPercentual(fracao: number): string {
  return `${Math.round(fracao * 1000) / 10}%`;
}

export default function ConvencaoColetivaPage() {
  const [vigenteHoje, setVigenteHoje] = useState<ConvencaoRow | null>(null);
  const [historico, setHistorico] = useState<ConvencaoRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);

  const [segundaSextaTexto, setSegundaSextaTexto] = useState("");
  const [sabadoTexto, setSabadoTexto] = useState("");
  const [domingoTexto, setDomingoTexto] = useState("");
  const [feriadoTexto, setFeriadoTexto] = useState("");
  const [vigenciaDesde, setVigenciaDesde] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregamento(null);
    const hoje = hojeIso();

    const [respostaHoje, respostaHistorico] = await Promise.all([
      supabase.rpc("convencoes_horas_adicionais_no_periodo", { p_data_inicio: hoje, p_data_fim: hoje }),
      supabase
        .from("empresa_convencao_horas_adicionais")
        .select("id,percentual_segunda_sexta,percentual_sabado,percentual_domingo,percentual_feriado,vigente_desde,vigente_ate")
        .order("vigente_desde", { ascending: false }),
    ]);

    if (respostaHoje.error || respostaHistorico.error) {
      setErroCarregamento(
        respostaHoje.error?.message ?? respostaHistorico.error?.message ?? "Não foi possível carregar a convenção coletiva.",
      );
      setCarregando(false);
      return;
    }

    const linhasHoje = (respostaHoje.data ?? []) as ConvencaoRow[];
    setVigenteHoje(linhasHoje[0] ?? null);
    setHistorico((respostaHistorico.data ?? []) as ConvencaoRow[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    // Busca de dados ao montar (mesmo padrão já usado, sem supressão
    // real de risco, em useCompatibilidadesRecurso.ts/useRecursos.ts) -
    // não há valor síncrono correto para o primeiro render, só uma
    // consulta assíncrona ao banco.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  // A linha "aberta" (vigente_ate is null) pode ser uma vigência
  // agendada para o futuro, distinta da que vale hoje - nunca tratada
  // como "a vigente atual" só por estar aberta (proteção pedida
  // explicitamente pelo usuário).
  const agendada = historico.find((linha) => linha.vigente_ate === null && linha.vigente_desde > hojeIso()) ?? null;
  const historicoEncerrado = historico.filter((linha) => linha.vigente_ate !== null);

  async function handleRegistrar() {
    setErroSalvar(null);
    setMensagemSucesso(null);

    let segundaSexta: number;
    let sabado: number;
    let domingo: number;
    let feriado: number;
    try {
      segundaSexta = converterPercentualParaFracao(segundaSextaTexto, "segunda a sexta");
      sabado = converterPercentualParaFracao(sabadoTexto, "sábado");
      domingo = converterPercentualParaFracao(domingoTexto, "domingo");
      feriado = converterPercentualParaFracao(feriadoTexto, "feriado");
    } catch (erro) {
      setErroSalvar(erro instanceof Error ? erro.message : "Percentual inválido.");
      return;
    }
    if (!vigenciaDesde) {
      setErroSalvar("Informe a data de início de vigência.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.rpc("registrar_convencao_horas_adicionais", {
      p_percentual_segunda_sexta: segundaSexta,
      p_percentual_sabado: sabado,
      p_percentual_domingo: domingo,
      p_percentual_feriado: feriado,
      p_vigente_desde: vigenciaDesde,
    });
    setSalvando(false);

    if (error) {
      setErroSalvar(error.message);
      return;
    }

    setMensagemSucesso("Convenção registrada.");
    setSegundaSextaTexto("");
    setSabadoTexto("");
    setDomingoTexto("");
    setFeriadoTexto("");
    setVigenciaDesde("");
    await carregar();
  }

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-text-primary sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div>
          <ModuleBackLink href="/central" label="Voltar" />
          <h2 className="mt-2 text-[15px] font-semibold text-text-primary">Convenção coletiva</h2>
          <p className="mt-1 text-[13.5px] text-text-secondary">
            Percentuais de acréscimo de hora adicional, globais por empresa. Alterar a convenção para o futuro nunca
            modifica cenários ou cálculos já feitos no passado - cada vigência fica registrada com sua data de
            início, e o histórico é permanente.
          </p>
        </div>

        {carregando ? <p className="text-[13.5px] text-text-secondary">Carregando...</p> : null}
        {erroCarregamento ? <p className="text-[13.5px] text-status-danger-text">{erroCarregamento}</p> : null}

        {!carregando && !erroCarregamento ? (
          <>
            <Card title="Vigente hoje">
              {vigenteHoje ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px]">
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Segunda a sexta</dt>
                    <dd className="text-text-primary">{formatarPercentual(vigenteHoje.percentual_segunda_sexta)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Sábado</dt>
                    <dd className="text-text-primary">{formatarPercentual(vigenteHoje.percentual_sabado)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Domingo</dt>
                    <dd className="text-text-primary">{formatarPercentual(vigenteHoje.percentual_domingo)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Feriado</dt>
                    <dd className="text-text-primary">{formatarPercentual(vigenteHoje.percentual_feriado)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Vigente desde</dt>
                    <dd className="text-text-primary">{formatarDataBr(vigenteHoje.vigente_desde)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-[13.5px] text-text-secondary">
                  Nenhuma convenção coletiva vigente hoje - regras de hora adicional para recursos internos ficam
                  bloqueadas até que uma seja registrada.
                </p>
              )}
            </Card>

            {agendada ? (
              <Card title="Agendada para o futuro">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13.5px]">
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Segunda a sexta</dt>
                    <dd className="text-text-primary">{formatarPercentual(agendada.percentual_segunda_sexta)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Sábado</dt>
                    <dd className="text-text-primary">{formatarPercentual(agendada.percentual_sabado)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Domingo</dt>
                    <dd className="text-text-primary">{formatarPercentual(agendada.percentual_domingo)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Feriado</dt>
                    <dd className="text-text-primary">{formatarPercentual(agendada.percentual_feriado)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11.5px] font-semibold text-text-secondary">Passa a valer em</dt>
                    <dd className="text-text-primary">{formatarDataBr(agendada.vigente_desde)}</dd>
                  </div>
                </dl>
              </Card>
            ) : null}

            <Card title="Nova convenção">
              <div className="flex flex-col gap-4">
                <p className="text-[13.5px] text-text-secondary">
                  Percentuais em número inteiro (ex.: 30 para 30%). A vigência nunca pode começar no passado -
                  agendar para uma data futura é permitido.
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <Field
                    label="Segunda a sexta (%)"
                    inputMode="decimal"
                    placeholder="30"
                    value={segundaSextaTexto}
                    onChange={(event) => setSegundaSextaTexto(event.target.value)}
                    disabled={salvando}
                  />
                  <Field
                    label="Sábado (%)"
                    inputMode="decimal"
                    placeholder="50"
                    value={sabadoTexto}
                    onChange={(event) => setSabadoTexto(event.target.value)}
                    disabled={salvando}
                  />
                  <Field
                    label="Domingo (%)"
                    inputMode="decimal"
                    placeholder="100"
                    value={domingoTexto}
                    onChange={(event) => setDomingoTexto(event.target.value)}
                    disabled={salvando}
                  />
                  <Field
                    label="Feriado (%)"
                    inputMode="decimal"
                    placeholder="100"
                    value={feriadoTexto}
                    onChange={(event) => setFeriadoTexto(event.target.value)}
                    disabled={salvando}
                  />
                  <Field
                    label="Vigente a partir de"
                    type="date"
                    value={vigenciaDesde}
                    onChange={(event) => setVigenciaDesde(event.target.value)}
                    disabled={salvando}
                  />
                </div>
                {erroSalvar ? <p className="text-[12.5px] text-status-danger-text">{erroSalvar}</p> : null}
                {mensagemSucesso ? <p className="text-[12.5px] text-status-success-text">{mensagemSucesso}</p> : null}
                <div>
                  <Button onClick={handleRegistrar} disabled={salvando}>
                    {salvando ? "Registrando..." : "Registrar nova convenção"}
                  </Button>
                </div>
              </div>
            </Card>

            {historicoEncerrado.length > 0 ? (
              <Card title="Histórico">
                <ul className="flex flex-col gap-2 text-[12.5px]">
                  {historicoEncerrado.map((linha) => (
                    <li key={linha.id} className="border-b border-border-subtle pb-2 last:border-b-0 last:pb-0">
                      <span className="text-text-primary">
                        {formatarDataBr(linha.vigente_desde)} a {formatarDataBr(linha.vigente_ate)}
                      </span>
                      <span className="text-text-secondary">
                        {" "}
                        · seg-sex {formatarPercentual(linha.percentual_segunda_sexta)} · sáb{" "}
                        {formatarPercentual(linha.percentual_sabado)} · dom {formatarPercentual(linha.percentual_domingo)} ·
                        feriado {formatarPercentual(linha.percentual_feriado)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
