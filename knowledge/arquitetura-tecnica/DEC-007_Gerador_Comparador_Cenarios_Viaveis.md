# DEC-007 — Decisão Técnica: Gerador e Comparador de Cenários Viáveis

**Data:** 2026-08-10
**Versão:** 1.1
**Status:** Vigente — desenho consolidado, aprovado. Fase 0 (núcleo puro do motor diário) autorizada.
**Natureza do documento:** decisão de arquitetura técnica, mesmo gênero de `DEC-001` a `DEC-006`.
Consolida 8 rodadas de revisão (diagnóstico + 7 correções sucessivas) sobre o desenho de uma
funcionalidade nova: gerar e comparar múltiplos cenários de capacidade (hora extra, troca de
prioridade entre projetos, terceirização, recursos temporários) antes de aprovar **um só**
cenário, persistido de forma completa e auditável.

**Contexto:** o diagnóstico prévio (mesma investigação que originou este desenho) confirmou, por
leitura direta do código e da documentação vigente (`PAD-008_Motor_Capacidade.md`,
`ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md`), que hoje **não existe** nenhuma
estrutura de "Cenário de Execução" — o fluxo é 1 preview agregado por janela → aprova → 1
snapshot. Turnos, horas extras, produtividade variável por cenário, antecipação e divisão de
lote têm **zero representação no código** (confirmado por grep em todo `src/`). Este documento
substitui esse vácuo por um desenho completo, revisado até fechar inconsistências reais (unidades
misturadas, ordem de alocação, granularidade agregada vs. diária, precedência presumida, estados
logicamente inconsistentes, concorrência não fechada, imutabilidade insuficiente).

---

## 1. Conceito central

Um **Cenário** é um conjunto de ajustes temporários aplicados por cima do cadastro real, só para
o cálculo — nunca gravados em `recursos_produtivos`, `bom_operacoes`, `recurso_produtivo_compatibilidades`
ou calendário. Produtividade de recurso real **nunca** é sobrescrita por percentual hipotético —
sempre a cadastrada (ou herdada, para recursos temporários, §10). O cenário "Normal" (sem nenhum
ajuste) é sempre o candidato zero.

## 2. Unidade interna única — horas de máquina, conversão só na entrada/saída

`necessario`/`comprometido` (via `calcular_comprometido_v2`) estão em **horas-padrão** (unidade de
trabalho, independente do recurso); a jornada/capacidade do recurso é **horas de máquina** (tempo
real de relógio). O motor diário trabalha internamente em horas de máquina por (recurso, data); a
única grandeza que trafega em horas-padrão entre candidatos/dias é o `necessarioRestante` da
operação (mesma "quantidade de trabalho", independente de quem a produz).

```ts
function horasMaquinaParaHorasPadrao(hm: number, produtividade: number): number { return hm * produtividade; }
function horasPadraoParaHorasMaquina(hp: number, produtividade: number): number { return hp / produtividade; }
```

## 3. Capacidade diária por recurso — normal, extra e sobrecarga separadas

Capacidade negativa **não é erro de dado — é sobrecarga real**, que deve ser visível, não escondida
numa subtração única:

```ts
function capacidadeDia(recursoId: string, data: string) {
  const normal = jornadaNormalHorasMaquina(recursoId, data);
  const comprometido = comprometidoHorasMaquina(recursoId, data); // convertido do horas-padrão para h-máquina deste recurso
  const extra = capacidadeExtraAutorizadaHorasMaquina(recursoId, data); // só a autorizada NESTE cenário

  return {
    normalDisponivel: Math.max(0, normal - comprometido),
    sobrecarga: Math.max(0, comprometido - normal), // já existente, real, reportada — nunca escondida
    extraDisponivel: extra, // NUNCA reduzida pelo comprometido antigo
  };
}
```

Consumo dentro do mesmo recurso/dia: `normalDisponivel` antes de `extraDisponivel`.

**Elegibilidade de hora extra** — a grade compartilhada precisa dizer quem pode consumir a
capacidade extra, senão um projeto antigo de prioridade maior pode "roubar" hora extra contratada
para viabilizar o orçamento novo:

```ts
type ElegibilidadeCapacidadeExtra =
  | { escopo: "somente_orcamento_novo" }
  | { escopo: "qualquer_projeto_do_cenario" }
  | { escopo: "projetos_especificos"; projetoIds: string[] };
```

Cada `CapacidadeExtraDia`/contratação carrega essa elegibilidade; o escalonador (§7) só permite
consumo de `extraDisponivel` por um projeto dentro do escopo autorizado.

**Contrato de capacidade extra** (substitui períodos simples e ajustes globais):

```ts
interface CapacidadeExtraDia {
  recursoId: string;
  data: string;
  horasAdicionaisDisponiveis: number; // >= 0
  natureza: "hora_extra" | "sabado" | "domingo" | "feriado";
  elegibilidade: ElegibilidadeCapacidadeExtra;
  contratacaoId: string; // §10
}
```

Dia normalmente produtivo (seg-sex): jornada normal + extra somam. Dia normalmente não produtivo
(sábado/domingo/feriado): jornada normal = 0, só a extra autorizada existe.

## 4. Ordem do alocador diário — data externa, candidato interno

```ts
function alocarOperacaoDiaAdia(
  necessarioHorasPadrao: number,
  candidatosPorPrioridade: CandidatoComCapacidadeDiaria[], // original, compatíveis (prioridade cadastrada), temporários
  datasOrdenadas: string[], // cronológicas, pode se estender além do prazo interno (§7)
): ResultadoAlocacaoDiaria {
  let restante = necessarioHorasPadrao;
  const alocacoes: AlocacaoDiaria[] = [];
  for (const data of datasOrdenadas) {
    if (restante <= 0) break;
    for (const candidato of candidatosPorPrioridade) {
      if (restante <= 0) break;
      const disponivelHM = candidato.capacidadeDiaria(data); // 0 se indisponível nesta data
      if (disponivelHM <= 0) continue;
      const restanteHM = horasPadraoParaHorasMaquina(restante, candidato.produtividade);
      const alocadoHM = Math.min(disponivelHM, restanteHM);
      const alocadoHP = horasMaquinaParaHorasPadrao(alocadoHM, candidato.produtividade);
      alocacoes.push({ recursoId: candidato.id, data, horasMaquina: alocadoHM, horasPadrao: alocadoHP });
      candidato.consumir(data, alocadoHM);
      restante -= alocadoHP;
    }
  }
  return { alocacoes, deficitResidualHorasPadrao: Math.max(0, restante) };
}
```

Data cronológica externa, candidato por prioridade interna — garante que um recurso com janela de
disponibilidade curta (máquina alugada, freelancer) seja considerado nos dias em que de fato está
disponível, não só depois de esgotar o recurso original inteiro.

## 5. Chave de ocorrência

`bomOperacaoId` sozinho não identifica uma operação de forma única (a mesma operação do roteiro
pode aparecer várias vezes por quantidade, item do projeto ou caminho de subconjuntos):

```ts
interface ChaveOcorrencia {
  projetoItemId: string;
  produtoRaizId: string;
  caminhoBomItemIds: string[]; // mesmo conceito já usado em gerarListaTecnicaProjeto.ts (OrigemMaterialConsolidado) — reaproveitado
  bomOperacaoId: string;
}
const chaveStr = (c: ChaveOcorrencia) => `${c.projetoItemId}::${c.produtoRaizId}::${c.caminhoBomItemIds.join(">")}::${c.bomOperacaoId}`;
```

Terceirização, recurso temporário, dependência de precedência e persistência referenciam
`ChaveOcorrencia`, nunca `bomOperacaoId` solto.

## 6. Grafo de precedência — dado mestre, não presumido por ocorrência

**Confirmado por leitura direta do schema** (não presumido):
- `bom_operacoes`: `unique (empresa_id, bom_id, ordem)` já existe (`202607060001_...sql:32`) —
  duplicidade de `ordem` no mesmo `bom_id` já é impossível hoje.
- `bom_operacoes.tipo` só aceita `('engenharia','producao')` — **não existe** marcador de
  "montagem". Não há hoje nenhum vínculo entre uma linha de `bom_itens`
  (`componente_tipo='subconjunto'`) e a `bom_operacoes` do pai que a consome.
- Proteção de ciclo na estrutura de materiais já existe
  (`202608040001_bom_subconjunto_protecao_ciclo.sql`).

**Regra 1 — sequência dentro do roteiro**: a predecessora de uma ocorrência não é "ordem − 1", é a
operação ativa **imediatamente anterior na ordenação crescente** (roteiros usam ordens espaçadas
— 10, 20, 30 — para permitir inserção futura sem renumerar):

```ts
function resolverPredecessoraLinear(operacoesDoBom: BomOperacaoRow[], atual: BomOperacaoRow): BomOperacaoRow | null {
  const ativasOrdenadas = operacoesDoBom
    .filter(op => op.ativo && op.deleted_at === null && op.ordem !== null) // ordem nula = erro impeditivo
    .sort((a, b) => a.ordem - b.ordem);
  const indice = ativasOrdenadas.findIndex(op => op.id === atual.id);
  return indice <= 0 ? null : ativasOrdenadas[indice - 1];
}
```

**Regra 2 — subconjunto → pai, dado mestre, múltiplos subconjuntos por operação**:

```sql
-- Fase de schema (§18, Fase 6)
create table public.bom_operacao_dependencias_subconjunto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  bom_operacao_id uuid not null references bom_operacoes(id),
  bom_item_id uuid not null references bom_itens(id),
  ativo boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- Unicidade só sobre vínculos VIVOS — índice único parcial permite excluir e recriar o vínculo.
create unique index bom_operacao_dependencias_subconjunto_par_vivo_uniq
  on public.bom_operacao_dependencias_subconjunto (empresa_id, bom_operacao_id, bom_item_id)
  where deleted_at is null;

alter table public.bom_operacao_dependencias_subconjunto enable row level security;
create policy bom_operacao_dependencias_subconjunto_select_tenant
  on public.bom_operacao_dependencias_subconjunto for select to authenticated
  using (empresa_id = public.empresa_atual_id());
-- escrita: mesma politica de manutencao de roteiro ja usada em bom_operacoes/bom_itens (nao redefinida aqui);
-- interface de manutencao (inclusao, edicao/exclusao logica, validacao) faz parte da Fase 7 (§18).

create or replace function public.validar_dependencia_subconjunto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_op record; v_item record;
begin
  select empresa_id, bom_id, ativo, deleted_at into v_op from public.bom_operacoes where id = new.bom_operacao_id;
  select empresa_id, bom_id, componente_tipo, ativo, deleted_at into v_item from public.bom_itens where id = new.bom_item_id;

  if v_op.empresa_id is distinct from new.empresa_id or v_item.empresa_id is distinct from new.empresa_id then
    raise exception 'bom_operacao_id e bom_item_id precisam pertencer à mesma empresa do vínculo.';
  end if;
  if v_op.bom_id is distinct from v_item.bom_id then
    raise exception 'bom_operacao_id e bom_item_id precisam pertencer ao mesmo bom_id (mesmo roteiro pai).';
  end if;
  if v_item.componente_tipo is distinct from 'subconjunto' then
    raise exception 'bom_item_id precisa ter componente_tipo=subconjunto.';
  end if;
  if not v_op.ativo or v_op.deleted_at is not null then
    raise exception 'bom_operacao_id precisa estar ativo.';
  end if;
  if not v_item.ativo or v_item.deleted_at is not null then
    raise exception 'bom_item_id precisa estar ativo.';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_dependencia_subconjunto() from public, anon;
```

Ciclo: mesma extensão da checagem já existente em `202608040001_...sql`, estendida para tratar
esta tabela como arestas adicionais do grafo verificado.

**Expansão por ocorrência**: para cada `ChaveOcorrencia` cujo `bomOperacaoId` tem 1+ linhas ativas
nesta tabela, cada linha gera uma `DependenciaOcorrencia{tipo:"consumo_subconjunto"}` distinta —
a operação do pai só fica pronta quando **todos** os subconjuntos dos quais depende concluírem
(suportado naturalmente pelo algoritmo de grau de entrada, §7).

**Roteiro sem vínculo**: fallback conservador — todas as operações do pai aguardam **todas** as
últimas operações de todos os subconjuntos diretos (nunca promete uma data mais otimista que a
realidade permite).

**Semântica de datas, fixada**: granularidade é diária, sem hora do dia. "Terminar em D" = fim do
expediente de D. Sucessora sempre começa no primeiro dia produtivo/disponível **estritamente
após** D (nunca no mesmo dia — limitação real da granularidade diária, declarada, não contornada).
`prazoDiasCorridos` é duração **inclusiva**: início 14/11, prazo=3 dias corridos → cobre 14,15,16
→ fim=16/11.

## 6.1 Fase 7 — cadastro do vínculo pela interface (implementação local)

Investigação factual (sem alterar código) confirmou: `useRoteiro.ts` já carrega `bom_itens`
(`componente_tipo='subconjunto'`) e `bom_operacoes` do mesmo `bom_id`, mas `RoteiroForm.tsx` não
tinha nenhuma referência cruzada entre as duas tabelas antes da Fase 7; `grafoPrecedencia.ts`
(`vinculosMestres.find(...)`) já implicava, antes mesmo de qualquer schema existir, que **no máximo
1 operação consumidora por subconjunto** é a semântica correta - confirmado como decisão de negócio
explícita nesta fase, não presumido do código.

**Desenho final** (2 rodadas de revisão com o usuário antes de implementar):
- Seleção "Necessário antes de" vive na **linha do subconjunto** (tabela Estrutura/Subconjuntos,
  `RoteiroForm.tsx`), não em modal por operação - um `select` de valor único por subconjunto, sem
  filtro de opções (uma mesma operação pode aparecer selecionada em várias linhas - um subconjunto só
  pode ter 1 operação, o inverso não tem essa restrição).
- Trocar operação = **1 `UPDATE`** atômico só de `bom_operacao_id` na mesma linha - nunca
  DELETE+INSERT. Remover (voltar para "— regra conservadora") = **`UPDATE`** de
  `deleted_at`/`deleted_by` - nunca `DELETE` físico, nunca policy/mensagem "somente administrador"
  (permitido a quem criou o vínculo OU administrador, mesmo nível de permissão de trocar).
- `ativo` da tabela é **sempre `true`** (`CHECK` incondicional, migration 202608120001) - a interface
  nunca usa esse campo para remover, só `deleted_at`/`deleted_by`, para nunca existirem dois conceitos
  de "removido" na mesma tabela. `mapearVinculosSubconjunto.ts` (Fase 7) não trata isso como
  irrelevante: valida `ativo===true` por linha viva e lança erro explícito se violado, em vez de
  ignorar silenciosamente - defesa em profundidade, não confia só no `CHECK`.
- Trigger novo `validar_atualizacao_dependencia_subconjunto` (`before update`, complementar ao
  `validar_dependencia_subconjunto` da Fase 6): `created_by`/`empresa_id`/`bom_item_id`/`ativo`
  imutáveis; sem restauração direta de vínculo removido; remoção lógica exige
  `deleted_by=auth.uid()` sem trocar `bom_operacao_id` no mesmo `UPDATE`; troca de operação não pode
  tocar `deleted_at`/`deleted_by`; vínculo já removido é imutável.
- Índice único `(empresa_id, bom_item_id) where deleted_at is null` (mais forte, subsome o índice da
  Fase 6) substitui `bom_operacao_dependencias_subconjunto_par_vivo_uniq` - a migration primeiro
  verifica duplicidade real por `bom_item_id`, aborta com mensagem clara se houver (nunca escolhe uma
  linha sozinha), só então cria o índice novo e remove o antigo.
- RLS: só `INSERT` (mesma empresa, `created_by=auth.uid()`) e `UPDATE` (dono OU admin) - **nenhuma
  policy de `DELETE`**, já que a remoção é sempre `UPDATE`.

**Contrato de leitura, não integração real**: `mapearVinculosSubconjunto.ts` traduz linhas cruas de
`bom_operacao_dependencias_subconjunto` para `VinculoSubconjuntoOperacaoConsumidora[]` (formato de
`grafoPrecedencia.ts`), testado isoladamente (Vitest, fixtures de linha crua, sem banco). **Não existe
hoje nenhum código que chame esse mapeador com dado real** - `construirGrafoOcorrencias` não é
chamado por nenhum módulo do sistema, e `prepararEntradasMotor.ts` (o único wiring real equivalente
que já existe, para `resolverBomAtivo`) não toca o grafo de precedência. A Fase 7 entrega **cadastro
completo pela interface + contrato de leitura testado** - a ligação real (consultar a tabela → chamar
o mapeador → alimentar `construirGrafoOcorrencias` dentro de uma simulação de verdade) é trabalho de
uma fase de integração do motor ainda não desenhada. Nunca afirmar "o motor lê vínculos reais"
enquanto essa ligação não existir de fato (correção de linguagem sobre a versão anterior deste
documento, que overclaimava esse ponto antes da revisão).

**Testes em 3 camadas, deliberadamente separadas**: Tier A (`supabase/tests/fase7_dependencia_subconjunto_teste.sql`,
SQL real, `BEGIN...ROLLBACK`) cobre a tabela/trigger/RLS/índice; Tier B (`grafoPrecedencia.test.ts`,
já existente, fechado, não muda) cobre a construção do grafo em memória; Tier C
(`mapearVinculosSubconjunto.test.ts`, novo) cobre só a tradução linha crua → formato do motor. Nenhuma
das 3 camadas, nem a soma delas, prova a integração fim-a-fim - essa prova só existe quando a fase de
integração do motor conectar as três.

## 6.2 Fase 8a — ponte dado real → grafo de ocorrências (implementação local)

Primeiro incremento da Fase 8 (§18): `mapearVinculosSubconjunto.ts` (§6.1) ganhou seu primeiro chamador
real. `coletarGrafoOcorrenciasBom.ts` (`src/modules/simulacao-comercial/lib/cenarios/`) é a ponte entre
dado real do roteiro e `construirGrafoOcorrencias` (Fase 1, §6) - função **irmã** de
`coletarEstruturaBom.ts` (motor antigo, `motorAvaliacaoSequencial.ts`, intocado). Decisão de desenho:
em vez de reimplementar a travessia recursiva de subconjuntos pela terceira vez (`calcular_custo_bom`
em SQL e `coletarEstruturaBom.ts` em TypeScript já são duas implementações independentes da mesma
regra - risco de divergência já registrado no cabeçalho de `coletarEstruturaBom.ts`), reaproveita
`lista_tecnica_nos_alcancaveis` (RPC SQL já existente, `202608040003_lista_tecnica_consolidada.sql`) -
cobre ciclo/produto ausente/excluído e devolve `caminho_bom_item_ids` por nó em 1 chamada ao servidor,
não N+1. Leitura (`coletarGrafoOcorrenciasBom`, cliente injetado) e transformação (`montarGrafoOcorrenciasBom`,
pura) são exportadas separadamente. Erros nunca ignorados silenciosamente: roteiro/operação ausente,
ciclo, subconjunto sem roteiro resolvível, IDs repetidos/inconsistentes, vínculo apontando para
operação inválida ou de outro bom, divergência de empresa (filtrada explicitamente nas consultas de
`bom_operacoes`/vínculos, nunca só por RLS). 20 testes com fixtures espelhando o caso real conhecido
(abaixo) - inclusive prova de que o fallback conservador e o vínculo mestre específico produzem grafos
diferentes, e que a chave completa da ocorrência nunca colide entre raiz e subconjunto.

**Achado da validação com dado real (produto `6158-02`, empresa `f835684a-0400-43a5-ba54-dd4629230c3c`,
BOM `1831dac5-a475-4987-8caf-3e74238c7df2`) - condição operacional importante para lembrar em qualquer
validação futura desta RPC (inclusive em `carregarBaseCenarios.ts`, Fase 8b em diante)**:
`lista_tecnica_nos_alcancaveis` é `security invoker`, e `empresa_atual_id()` (usada internamente para
escopar toda junção) depende de `auth.uid()` - só resolve corretamente sob sessão autenticada. A
primeira tentativa de validação, rodada direto no SQL Editor sem contexto de sessão (superusuário,
sem JWT), devolveu `tem_bom=false`/`bom_resolvido_id=null` para o produto `6158-02` - um **falso
negativo**: o produto e o BOM existem de verdade (confirmado por consulta direta às tabelas), mas toda
junção interna da RPC, escopada por `= empresa_atual_id()`, silenciosamente não bateu com nada porque
`empresa_atual_id()` resolveu `null` sem uma sessão real. Repetindo a mesma consulta com JWT simulado
(`SET LOCAL ROLE authenticated` + `set_config('request.jwt.claim.sub', ...)`, técnica já estabelecida
nos testes da Fase 6/7) de um usuário real da Enifer, a RPC devolveu corretamente os dois níveis (raiz
+ subconjunto `02-6158-03-01`). `coletarGrafoOcorrenciasBom.ts` em si não precisa de nenhum tratamento
especial - ela só repassa o `SupabaseClient` injetado, e herda a sessão que ele carrega, exatamente
como qualquer outra chamada de RPC deste projeto; evidência de que isso já funciona sob sessão real de
navegador em produção: `gerar_lista_tecnica_projeto` (que chama a mesma `lista_tecnica_nos_alcancaveis`
por baixo) já é usada hoje por `ListaTecnicaProjetoModal.tsx`, em produção desde 2026-08-05.

**Decisão confirmada com o usuário para o recorte 8b (hora extra) - comprometido de outros pedidos**:
o motor novo (`escalonadorConjunto.ts`) modela concorrência por ocorrências explícitas na mesma grade,
não por desconto agregado (diferente do motor antigo, `calcular_comprometido_v2`) - mas construir a
reconstrução real de outros projetos concorrentes (via `ordens_producao`/`operacoes_producao` ou
estimativa FIFO, §9) é trabalho da Fase 8c, não do recorte 8b. Ignorar comprometido inteiramente no
8b superestimaria a capacidade livre e produziria datas enganosas - inaceitável mesmo como
provisório. Solução para o 8b, com condições explícitas:
- `carregarBaseCenarios.ts` reaproveita `calcular_comprometido_v2` (mesma RPC do motor antigo, total
  agregado por recurso, não por dia) e desconta esse total **antes** de disponibilizar qualquer hora
  normal ou extra ao candidato do escalonador - consumido a partir dos dias produtivos mais próximos
  do início da janela (assunção conservadora: capacidade de curto prazo é a mais provável já estar
  comprometida).
- A interface (8b) precisa identificar todo resultado como **estimativa preliminar** - o comprometido
  usado não está distribuído dia a dia de verdade, só agregado.
- **Nenhuma aprovação definitiva pode se basear só neste recorte.**
- 8c substitui esta aproximação pela reconstrução multiprojeto/FIFO com impacto diário real (mesmo
  mecanismo de `estimarDistribuicaoFifoLegada`/`construirImpactosProjetosDeslocados`, §9).
- **A Fase 8 não é considerada encerrada enquanto essa substituição não estiver pronta e validada** -
  reforça a condição já registrada em §18: 8c é parte do critério de conclusão, não backlog futuro.

### 6.2.1 Fase 8a — extensão: terceirização e recurso temporário/freelancer

`avaliarCenario.ts` estendido para as 3 dimensões single-projeto do recorte 8b (hora extra já fechado
e auditado, comportamento preservado sem alteração). Decisões de desenho:

- **Terceirização via candidato sintético "1 unidade/dia corrido"** - em vez de modificar
  `escalonarConjuntoComFilaDeProntos` (Fase 2, fechado) para ter um caminho especial de terceirização,
  a ocorrência terceirizada recebe `necessarioHorasPadrao := prazoDiasCorridos` e um candidato
  exclusivo (id único por ocorrência, nunca compartilhado) que sempre oferece exatamente 1 unidade de
  capacidade por dia. Como `resolverDataMinimaBruta` do escalonador já aplica a MESMA fórmula de
  `calcularDatasTerceirizacao` (`resolverDataInicioMinima` com calendário identidade) para achar o
  início a partir da(s) predecessora(s), consumir 1 unidade/dia por N dias corridos consecutivos
  reproduz exatamente a duração inclusiva de `calcularFimPorDuracaoInclusiva` - sem duplicar nem uma
  linha da lógica de datas já testada em `terceirizacao.ts`.
- **Terceirização é exclusiva por ocorrência** - uma ocorrência terceirizada usa SÓ o candidato
  sintético (nunca combina com hora extra/compatibilidade/recurso temporário na mesma ocorrência,
  já que terceirizar significa sair inteiramente da capacidade interna). Cenários PODEM combinar
  terceirização numa operação com hora extra/temporário em outras operações do mesmo cenário - a
  exclusividade é por ocorrência, não por cenário inteiro.
- **Recurso temporário como última alternativa** - quando `recursoTemporarioAplicavelA` autoriza,
  entra em `candidatoIdsPorPrioridade` depois do recurso original e dos compatíveis (decisão de
  desenho: contratar temporário é tentado só se nada interno bastar). `produtividadeReferencia` é
  parâmetro explícito, resolvido pelo CHAMADOR (leitura de `recursos_produtivos`) - nunca lida dentro
  de `avaliarCenario`, preservando "zero I/O" mesmo com a nova dimensão.
- **Custeio por cruzamento, não por embutimento** - hora extra usa `AlocacaoDiaria.contratacaoId`
  diretamente (faixa já carrega isso); recurso temporário cruza `AlocacaoDiaria.recursoId` (=
  `idTemporario`) com `RecursoTemporarioCenario.contratacaoId` por fora (suas faixas nunca têm
  `contratacaoId` próprio, mesmo contrato de `recursoTemporario.ts`).
- **Terceirização rejeita abrangência incompatível - nunca custo 0 silencioso** (correção pós-auditoria,
  achado real: a primeira versão desta extensão deixava `abrangencia="por_hora_utilizada"` numa
  terceirização silenciosamente resultar em custo 0, já que a unidade sintética "1/dia" não é hora de
  máquina real). `validarDecisoesTerceirizacao` roda ANTES de qualquer cálculo e rejeita, com erro
  explícito: contratação ausente (`contratacaoId` sem `Contratacao` correspondente em
  `decisoes.contratacoes` - o mesmo tipo de bug, por outro caminho) e `abrangencia` fora de
  `{por_periodo_completo, valor_fixo_unico}` - as únicas duas cujo valor depende só de
  `Contratacao.valor`, nunca de uso. `por_dia_contratado` também é rejeitada (dependeria de
  `datas.length` bater com `prazoDiasCorridos`, uma consistência que este módulo não verifica) -
  preferível recusar a confiar silenciosamente. Isso é uma garantia do PRÓPRIO NÚCLEO, não só da
  interface (8b) - `avaliarCenario` pode ser chamado fora da tela.
- **Validação contra dado órfão/duplicado** (mesma disciplina do resto do módulo): id de recurso
  temporário colidindo com recurso real ou duplicado entre si, e `DecisaoTerceirizacao` apontando
  para ocorrência inexistente ou duplicada para a mesma ocorrência - todos lançam erro explícito,
  nunca ignorados silenciosamente.

Testes: 16 novos - terceirização isolada (duração inclusiva + custo, capacidade interna irrelevante);
rejeição de abrangência incompatível (`por_hora_utilizada`, `por_dia_contratado`) e aceitação de
`por_periodo_completo`; recurso temporário isolado (aplicável, não aplicável - nunca ofertado, colisão
de id); recurso temporário + hora extra na mesma ocorrência; as 3 alternativas em operações distintas
do mesmo cenário com cada contratação custeada exatamente 1 vez (soma individual = total); terceirizar
uma ocorrência bloqueando capacidade interna/extra/temporária PARA ELA MESMA mesmo com as 3 fartamente
disponíveis; decisão órfã/duplicada. Suíte completa: 70 arquivos / 700 testes.

## 7. Escalonador conjunto — fila de prontos

Uma lista estática "prioridade + precedência" pode colocar uma sucessora antes dela estar
liberada. Correto: fila de prontos (Kahn), grau de entrada só decrementado quando a predecessora
**conclui de verdade** (déficit zero, data final válida) — senão, toda a descendência fica
`bloqueada_por_predecessora`, nunca liberada indevidamente:

```ts
function escalonarConjuntoComFilaDeProntos(grafo: GrafoOcorrencias, calendario: CalendarioCompartilhado) {
  const resultados = new Map<string, ResultadoOcorrencia>();
  const grauEntrada = new Map(grafo.ocorrencias.map(oc => [chaveStr(oc.chave), grafo.predecessorasDe(oc.chave).length]));
  let prontas = grafo.ocorrencias.filter(oc => grauEntrada.get(chaveStr(oc.chave)) === 0);
  const finalizadas = new Set<string>();

  while (prontas.length > 0) {
    prontas.sort(criterioDeEscolha); // prioridade do projeto (§9), desempate determinístico
    const proxima = prontas.shift()!;
    const janela = janelaAPartirDe(dataInicioMinima(proxima, resultados));
    const resultado = alocarOperacaoDiaAdia(proxima.necessarioHorasPadrao, proxima.candidatos, janela);
    const concluida = resultado.deficitResidualHorasPadrao === 0 && resultado.dataFimReal !== null;
    calendario.consumir(resultado.alocacoes);
    resultados.set(chaveStr(proxima.chave), { ...resultado, status: concluida ? "concluida" : "bloqueada_por_deficit" });

    if (concluida) {
      finalizadas.add(chaveStr(proxima.chave));
      for (const sucessora of grafo.sucessorasDe(proxima.chave)) {
        const novoGrau = grauEntrada.get(chaveStr(sucessora.chave))! - 1;
        grauEntrada.set(chaveStr(sucessora.chave), novoGrau);
        if (novoGrau === 0) prontas.push(sucessora);
      }
    }
    // não concluída: nenhuma sucessora tem seu grau decrementado por esta aresta.
  }

  for (const oc of grafo.ocorrencias) {
    const chave = chaveStr(oc.chave);
    if (!resultados.has(chave)) {
      const predecessoraFalhou = grafo.predecessorasDe(oc.chave).some(p => !finalizadas.has(chaveStr(p.chave)));
      resultados.set(chave, { bloqueada: true, motivo: predecessoraFalhou ? "bloqueada_por_predecessora" : "ciclo_ou_erro_estrutural" });
    }
  }
  return resultados;
}
```

A propagação de bloqueio é transitiva pela própria mecânica do grau de entrada — nenhum código
extra de "propagar para descendentes" é necessário.

### 7.1 Exemplo de regressão fixo — B×Y

Cenário canônico usado como teste de regressão da Fase 2 (implementado em
`escalonadorConjunto.test.ts`), substituindo a referência antes vaga a "exemplo B×Y desta
decisão":

- Recurso compartilhado: `R1`, produtividade 100%.
- Capacidade normal: 8 horas/dia em 09, 10 e 11/11/2026.
- Projeto B: uma ocorrência pronta, `necessarioHorasPadrao` = 12h.
- Projeto Y: uma ocorrência pronta, `necessarioHorasPadrao` = 8h.
- Convenção de prioridade: menor número = maior prioridade.

**Programação-base — B antes de Y** (prioridade B=1, Y=2):
- B: 8h em 09/11 + 4h em 10/11 → termina em 10/11.
- Y: 4h em 10/11 + 4h em 11/11 → termina em 11/11.

**Programação-proposta — Y antes de B** (prioridade Y=1, B=2):
- Y: 8h em 09/11 → termina em 09/11.
- B: 8h em 10/11 + 4h em 11/11 → termina em 11/11.

O teste prova: zero dupla reserva (nenhum dia soma mais que 8h em `R1`); inverter a prioridade
produz exatamente as datas acima; inverter a ordem dos arrays de entrada (mesma prioridade) não
altera o resultado; prioridades exatamente iguais também produzem resultado determinístico
(desempate por data mínima de início e, por fim, pela chave completa da ocorrência — nunca pela
ordem de chegada no array); o diff leve (`compararProgramacoes`, §9) entre as duas programações
registra Y adiantado em 2 dias e B atrasado em 1 dia (`diasVariacaoFim`, em dias civis nesta
fase — a distância em dias produtivos completa fica para a Fase 5).

**Grade estendida além do prazo**: quando uma ocorrência não fecha na janela original, o
escalonador continua de verdade, dia a dia, respeitando o calendário real (feriados/fins de
semana), até fechar (déficit=0) ou atingir o horizonte técnico de segurança (mesmo
`diasCivisExaminados` já usado no Calculador Reverso atual) — nunca uma estimativa por divisão de
déficit pela capacidade média.

## 8. Data-fim ≠ D* — dois cálculos formalmente separados

- **Escalonamento direto**: a partir da disponibilidade real, produz `dataInicioReal`/`dataFimReal`
  — resposta objetiva a "quando isso realmente termina, dado este plano." Sempre computável.
- **D\***: pergunta inversa — "qual a data mais tardia de início que ainda cumpre o prazo interno?"
  Cada candidata roda o escalonador conjunto completo (§7), não mais o Motor agregado simples —
  ver §8.1 para o mecanismo de busca (varredura linear regressiva, **não** busca binária) e §8.2
  para os estados do resultado (versão 2 do método).

### 8.1 Mecanismo de busca — varredura linear regressiva, não busca binária

**Decisão revisada** (a proposta original desta seção previa busca binária, "mesma filosofia do
Calculador Reverso atual" — abandonada após prova de contraexemplo durante a implementação da
Fase 3): busca binária exige que viabilidade seja monotônica em função da candidata (mais tarde
nunca mais viável que mais cedo). Isso **vale** no Motor legado agregado
(`estimarInicioNecessario.ts`) — lá a capacidade cresce estritamente com o número de dias, sem
noção de concorrência por data/recurso, e `buscarMaiorIndiceViavel` continua correto e é o
mecanismo certo para esse modelo. Isso **não vale** no escalonador conjunto completo (recursos
temporários, disponibilidade restrita, precedência, concorrência real por data/recurso).

**Contraexemplo provado** (implementado como regressão fixa em
`calculadorReversoConjunto.test.ts`, descrição "contraexemplo de não-monotonicidade"): `A` é raiz
do orçamento novo e usa o recurso `R1`; `C` é um projeto concorrente (rank de prioridade mais
baixo que `A`, mesmo `R1`) cuja sucessora `D` usa o recurso `R2`; `B`, sucessora do próprio `A`,
também usa `R2`, mas só é elegível numa faixa específica (`hora_extra` restrita ao projeto de `C`
numa data, `normal` aberta na outra). Antecipar a data de início de `A` muda **qual dia** `C`
consegue usar em `R1` (porque `A` já não ocupa mais o mesmo dia) — isso desloca quando `C` conclui,
o que desloca a janela de `D` em `R2`, o que decide se `D` consome a faixa restrita (deixando a
faixa aberta livre para `B`) ou é empurrada para a própria faixa aberta (colidindo com `B`).
Resultado: a candidata **mais tarde** é viável (`B` conclui no prazo) e a candidata **mais cedo**
não é (`B` nunca conclui) — o oposto do que busca binária assume. Fixar a ordem de processamento
(prioridade + chave, sem desempate por data) evita a reordenação **direta** entre `A` e `C`, mas
não evita esse efeito **indireto**, via um recurso que `A` nunca toca.

**Mecanismo adotado**: varredura **regressiva**, candidata por candidata, sempre com grade e
registro de candidatos **novos** por tentativa (nenhuma mutação vaza entre candidatas — mesmo
princípio de isolamento do escalonador, §7, aplicado agora entre tentativas da mesma busca):

1. Começa pela candidata mais tardia (mais próxima do prazo interno).
2. Monta ocorrências/dependências/registro de candidatos completamente novos para essa candidata.
3. Roda o escalonador conjunto completo.
4. Se a cadeia do orçamento novo cumprir o prazo, essa é D\* — a busca termina.
5. Senão, testa a candidata anterior (dia civil), até o piso técnico.

Termina cedo no caso comum (folga real perto do prazo) e garante o D\* correto sem depender de
uma propriedade que o modelo completo não possui. Otimização (ex.: poda parcial válida só sob
hipóteses adicionais comprovadas) fica para trabalho futuro, se a performance em produção
justificar — correção teve prioridade sobre economizar execuções nesta entrega.

### 8.2 Estados do resultado — versão 2, sem reinterpretar snapshots da versão 1

O método antigo (`estimarInicioNecessario.ts`, `metodoVersao=1`) já persistiu `janela_insuficiente`
via `aprovar_projeto_com_simulacao_v5` com um significado específico — **disponibilidade de
material depois de D\*** (comparação `dataDisponibilidadeProducao` × D\*). O escalonador conjunto
não modela material nesta fase; reaproveitar o mesmo nome com um significado diferente
reinterpretaria snapshots já gravados silenciosamente. Correção: `janela_insuficiente` permanece
**exclusivo** do método v1, nunca emitido pelo método v2. Estados de `metodoVersao=2`
(`buscarDataInicioMaisTardiaViavel`, `calculadorReversoConjunto.ts`):

| Estado | Significado |
|---|---|
| `viavel` | D\* encontrado dentro de `[piso técnico, prazoInterno]`, com folga real (`dataFimReal(D*) < prazoInterno`). |
| `viavel_no_limite` | D\* encontrado, `dataFimReal(D*) === prazoInterno` (folga zero). |
| `prazo_inviavel` | Nenhuma candidata testada cumpre o prazo, mas **pelo menos uma** conclui de verdade — reporta a MELHOR (menor) data-fim real entre todas as que concluíram, mesmo que depois do prazo. Nome novo (não é `janela_insuficiente` — eixo diferente: prazo, não material). |
| `dados_insuficientes` | Alguma ocorrência do orçamento novo não tem nenhum candidato (recurso) elegível — gap de cadastro, não de tempo; verificado antes de qualquer tentativa. |
| `horizonte_tecnico_excedido` | NENHUMA candidata testada produz conclusão alguma dentro do horizonte técnico examinado. |

**Classificação não presume monotonicidade** (correção sobre a versão anterior desta seção, que
definia `prazo_inviavel`/`horizonte_tecnico_excedido` só a partir da candidata mais cedo testada —
a mesma hipótese refutada pelo contraexemplo de §8.1): como uma candidata do MEIO da varredura pode
concluir enquanto a mais cedo não conclui de jeito nenhum, a classificação acumula a melhor
conclusão tardia vista em TODAS as candidatas examinadas, nunca só na de índice 0. Testado em
`calculadorReversoConjunto.test.ts` reaproveitando o próprio contraexemplo de §8.1: com um prazo
mais apertado, a candidata mais cedo nunca conclui (déficit) mas uma candidata posterior conclui
tarde — o estado correto é `prazo_inviavel` com a data dessa candidata posterior, nunca
`horizonte_tecnico_excedido`.

**Raiz/finais do orçamento nunca podem ser confundidos com ocorrências de outro projeto**:
`buscarDataInicioMaisTardiaViavel` exige `projetoIdOrcamentoNovo` explícito — toda chave em
`chavesOrcamentoNovo` precisa resolver para uma ocorrência com esse `projetoId` e
`ehOrcamentoNovo=true`, e `chavesRaizOrcamentoNovo`/`chavesFinaisOrcamentoNovo` precisam ser
subconjunto de `chavesOrcamentoNovo` — nunca apontar, por engano, para uma ocorrência da base
comprometida que só por coincidência exista no mesmo `ocorrencias`.

**Intervalo prometido é validado**: `datasCandidatas` documenta cobrir `[piso técnico,
prazoInterno]` — a última candidata precisa ser `<= prazoInterno`, rejeitado explicitamente caso
contrário (nunca uma candidata testada além do próprio prazo, que tornaria o próprio conceito de
D* incoerente).

A UI explica cada estado conforme `metodoVersao` lido do snapshot — nunca reinterpreta
`janela_insuficiente` de um registro antigo à luz do modelo novo.

## 9. Troca de prioridade — escalonador conjunto multi-projeto

Recalcular projetos concorrentes separadamente (cascata "Y desloca Z") não garante que a mesma
hora não seja usada duas vezes. Correto: reunir o orçamento novo **e todos os projetos
concorrentes conectados** (transitivamente, via travessia com `visited` — conjunto de projetos é
finito por empresa) sobre a **mesma** grade compartilhada, rodar o escalonador (§7) duas vezes:
- `programacaoBase`: projetos já comprometidos, ordem de prioridade **atual**.
- `programacaoCenario`: os mesmos projetos + o orçamento novo, ordem **proposta**.

```ts
interface ImpactoProjetoDeslocado {
  projetoId: string;
  numeroProjeto: string;
  producaoIniciada: boolean; // detalhar_comprometido_por_origem faz LEFT JOIN com ordens_producao/operacoes_producao
  origens: { recursoId: string; data: string; horasRetiradas: number }[]; // diff entre programacaoBase e programacaoCenario
  operacoesAfetadas: { chave: ChaveOcorrencia; estadoAnterior: EstadoEstimativa; estadoPosterior: EstadoEstimativa }[];
  inicioProgramadoAnterior: string; inicioProgramadoNovo: string;
  terminoProgramadoAnterior: string; terminoProgramadoNovo: string;
  prazoInterno: string;
  dStarAnterior: string | null; // null = não encontrado dentro do prazo
  dStarNovo: string | null;
  diasDeAtraso: number;
}
```

Impacto = um `ImpactoProjetoDeslocado` por projeto afetado, resultado direto do diff entre as duas
rodadas conjuntas — **não** uma estrutura recursiva de cascata (a computação simultânea sobre a
mesma grade já resolve todos os projetos conectados de uma vez; não há "nível 2" a calcular à
parte).

**Ordenação de prioridade — confirmado por leitura**: `projetos.prioridade` existe
(`202606030001_...sql:12,30-31`), `text not null default 'normal'`, `check in ('baixa','normal','urgente')`
— **3 categorias, insuficiente para ordenar totalmente N projetos concorrentes**. Contrato: dentro
da mesma categoria, desempate por `aprovado_em` ascendente (primeiro aprovado mantém posição). A
prioridade **proposta** pelo cenário é a posição em que o orçamento novo é inserido nessa ordem —
ambas (base e proposta) são persistidas por completo (§12), não só a categoria.

**Cascata sem corte arbitrário**: proteção de ciclo real, limite técnico alto **só como freio de
segurança** contra bug — nunca como corte de negócio. Se o limite for atingido, o cenário inteiro
fica **bloqueado**, nunca "aprovado com efeito parcial".

**Snapshot legado (sem alocação diária persistida)**: nunca FIFO silencioso.
1. Reconstrói via `ordens_producao`/`operacoes_producao` reais, quando existirem.
2. Senão, estimativa FIFO explícita, exibida para confirmação do usuário.
3. Premissa (fonte + confirmação) congelada no `ajuste_cenario` (§12).
4. Aprovação bloqueada até a confirmação explícita.

**Estados nunca melhoram ao perder capacidade** — só pioram ou mantêm.

### 9.1 Escopo da Fase 5 — decisões confirmadas na implementação

**Conexão entre projetos**: dois projetos são conectados sse alguma ocorrência de um e alguma
ocorrência do outro referenciam o **mesmo `candidatoId` exato** em `candidatoIdsPorPrioridade` —
é exatamente o que faz dois projetos competirem pela mesma instância de capacidade no escalonador
(§7). Implementado em `travessiaProjetosConectados.ts` (BFS a partir do orçamento novo, limite
técnico default 10.000 — freio de segurança, nunca corte de negócio; testado com uma cadeia real
de 50 projetos conectados transitivamente, que resolve por inteiro).

**`dStarAnterior`/`dStarNovo` não são calculados dentro de `ImpactoProjetoDeslocado`** (decisão
confirmada com o usuário — exigiriam rodar o Calculador Reverso conjunto completo, Fase 3, por
projeto afetado, nas duas ordens, multiplicando buscas dentro do diff). `construirImpactosProjetosDeslocados`
(`impactoProjetoDeslocado.ts`) só repassa o que o chamador já tiver calculado por fora
(`metadadosPorProjetoId`, opcional) — o núcleo do diff (origens, operações afetadas, início/término
programado, `diasDeAtraso`) é inteiramente derivado das duas rodadas do escalonador já calculadas,
sem busca adicional.

**`programacaoBase` e `programacaoCenario` NÃO têm o mesmo conjunto de ocorrências** — base exclui
o orçamento novo por definição; só as ocorrências de projetos **já comprometidos** precisam existir
nos dois resultados. Isso difere do contrato de `compararProgramacoes` (§7, usado para B×Y — duas
ordens do MESMO conjunto de participantes); `construirImpactosProjetosDeslocados` tem seu próprio
diff porque o conjunto de participantes muda entre as duas rodadas aqui.

**Estimativa FIFO do snapshot legado — só a aritmética nesta fase** (decisão confirmada com o
usuário): `estimarDistribuicaoFifoLegada` (`estimativaFifoLegado.ts`) reaproveita `alocarOperacaoDiaAdia`
(§4/Fase 0) sem modificação — trata o comprometido agregado legado como uma ocorrência comum,
competindo pela capacidade real já líquida. A leitura real de `ordens_producao`/`operacoes_producao`
(passo 1 da lista acima) e o fluxo de confirmação do usuário na tela (passos 2-4) ficam para a
Fase 9 (RPC) — este módulo só produz o número a ser exibido para essa confirmação.

**"Estado nunca melhora ao perder capacidade" é propriedade de teste, não invariante de runtime**:
`construirImpactosProjetosDeslocados` não impõe essa checagem internamente — a Fase 3 já provou
(contraexemplo, §8.1) que cascatas em grafos gerais podem produzir efeitos indiretos
contraintuitivos por caminhos que não passam pelo recurso disputado diretamente; um `throw` rígido
aqui arriscaria rejeitar um resultado legítimo. A propriedade é verificada em teste, sobre um
exemplo concreto (B×Y adaptado — perda de capacidade em `R1` correlaciona com `concluida` →
`bloqueada_por_deficit`, nunca o inverso), não garantida pelo código para todo grafo possível.

**Correções de auditoria da Fase 5** (4 brechas reais, corrigidas após revisão):

1. **Ordem do FIFO legado é explícita, nunca a ordem incidental do array** — `ComprometidoAgregadoLegado`
   ganhou o campo `ordemFifo` (menor = processa primeiro); `estimarDistribuicaoFifoLegada` ordena por
   `(ordemFifo, chave completa)` antes de processar, nunca pela posição no array de entrada (mesma
   classe de bug já corrigida no escalonador conjunto, Fase 2).
2. **Estimativa parcial é marcada explicitamente** — `ResultadoEstimativaFifoLegada` ganhou o campo
   `status: "completa" | "parcial"`, derivado de `deficitResidualHorasPadrao`, para o chamador nunca
   precisar lembrar de comparar o número contra zero.
3. **Término programado só é uma data real quando TODAS as ocorrências do projeto estão concluídas**
   nesse run — `dataFimReal` de uma ocorrência `bloqueada_por_deficit`/`bloqueada_por_predecessora` é
   só "até onde chegou" (mesma invariante do §7), nunca um término real; `terminoProgramadoAnterior`/
   `terminoProgramadoNovo` viram `null` quando isso acontece (mesma correção já aplicada em
   `compararProgramacoes.ts`, Fase 2, reincidente aqui até a auditoria da Fase 5).
4. **`origens` agrega por (recurso, data) no nível do PROJETO antes de calcular a retirada, nunca por
   ocorrência isolada** — se a operação X perde 4h e a operação Y do MESMO projeto ganha 4h no MESMO
   recurso/data, o saldo líquido do projeto ali é zero; somar diffs positivos por ocorrência (como a
   primeira versão fazia) reportaria 4h retiradas por engano, ignorando a compensação interna.

Mais duas guardas (recomendadas na mesma auditoria, sem serem falhas de cálculo por si só):
`resultadosCenario` também é validado contra chave extra que não exista em `ocorrencias` (antes só
`resultadosBase` era checado); `operacoesAfetadas` passou a incluir uma ocorrência quando
`dataInicioReal` ou a composição de `alocacoes` muda, mesmo que `status` e `dataFimReal` permaneçam
iguais — mudança real de agenda que a checagem anterior (só status + fim) deixava passar.

**Correções da segunda rodada de auditoria da Fase 5** (2 brechas adicionais):

5. **`resultadosBase` ainda podia conter uma chave do PRÓPRIO orçamento novo** — a validação
   "chave existe em `ocorrencias`" não bastava, porque as chaves do orçamento novo TAMBÉM existem em
   `ocorrencias` (só não deveriam estar em `resultadosBase` especificamente). Checagem nova, dedicada:
   nenhuma chave com `projetoId === projetoIdOrcamentoNovo` pode aparecer em `resultadosBase` -
   "programação-base" é por definição só os projetos já comprometidos.
6. **Bloqueio do FIFO legado precisa existir no nível do LOTE, não só por item** — `estimarDistribuicaoFifoLegada`
   passou a devolver `{ resultados, statusGlobal }` em vez de um array solto; `statusGlobal` é
   `"parcial"` se QUALQUER item do lote for parcial, mesmo que os demais tenham fechado - o chamador
   nunca precisa escanear item a item para saber se a aprovação (Fase 9) deve ficar bloqueada.

**Correção da terceira rodada de auditoria da Fase 5** (1 brecha final — proveniência da estimativa):

7. **`fonte: "estimativa_fifo_legado"` presente em TODA saída** (completa ou parcial) de
   `estimarDistribuicaoFifoLegada` — é o que materializa a "premissa (fonte + confirmação) congelada
   no `ajuste_cenario`" do passo 3 da lista de "Snapshot legado" acima: sem esse campo, nada no
   resultado em si (números de alocação, deficit) distingue uma reconstrução ESTIMADA de dado real
   vindo de `ordens_producao`/`operacoes_producao` — a distinção precisa sobreviver à
   serialização/persistência, não só existir implicitamente por "este é o módulo que eu chamei".
   **Duas confirmações diferentes, nunca confundidas**: (1) o usuário aceitar que esta é uma
   reconstrução ESTIMADA, não o dado real — uma confirmação sobre a PROVENIÊNCIA (`fonte`); (2) a
   capacidade ser SUFICIENTE dentro do horizonte — uma questão de FATO (`statusGlobal`). A
   confirmação (1) nunca torna (2) verdadeira: se `statusGlobal === "parcial"`, a aprovação continua
   bloqueada por falta de horizonte mesmo que o usuário já tenha aceitado a origem FIFO — aceitar a
   fonte da estimativa não é o mesmo que a estimativa caber.

## 10. Terceirização, recursos temporários, custeio

**Recurso temporário** herda produtividade de referência, nunca digitada, e tem disponibilidade
**diária** (não período simples início/fim — não informa se trabalha sábado/domingo/feriado):

```ts
interface RecursoTemporarioCenario {
  idTemporario: string;
  tipo: "maquina_alugada" | "freelancer";
  recursoReferenciaId: string; // produtividade herdada
  disponibilidade: { data: string; horasDisponiveis: number }[];
  contratacaoId: string;
  justificativa: string;
  aplicavelAsOperacoes: ChaveOcorrencia[];
}
```

**Contratação como entidade** — evita cobrança repetida de `valor_fixo_unico` em várias datas:

```ts
interface Contratacao {
  id: string;
  tipo: "hora_extra" | "sabado_domingo_feriado" | "maquina_alugada" | "freelancer" | "terceirizacao";
  abrangencia: "por_hora_utilizada" | "por_dia_contratado" | "por_periodo_completo" | "valor_fixo_unico";
  valor: number;
  moeda: string;
  fornecedorOuContratado: string;
  referenciaProposta: string | null;
  justificativa: string;
  datas: string[];
}
```

Terceirização: opera fora do calendário produtivo interno (dias corridos), com precedência exata
via §6 — só inicia quando a predecessora tem data-fim válida.

**Fórmula de custo por `abrangencia`** (não especificada nas rodadas anteriores desta decisão —
confirmada com o usuário na Fase 4, implementada em `contratacao.ts`):

| `abrangencia` | Fórmula |
|---|---|
| `por_hora_utilizada` | `valor × horas realmente usadas` (soma real de consumo — a origem varia por tipo: capacidade extra em recurso real lê `AlocacaoDiaria.contratacaoId`; recurso temporário cruza `AlocacaoDiaria.recursoId` = `idTemporario` com `RecursoTemporarioCenario.contratacaoId`). |
| `por_dia_contratado` | `valor × datas.length` — paga o dia **contratado** (ex.: diária de máquina alugada), usado ou não. |
| `por_periodo_completo` | `valor`, cobrado **uma única vez**, independente de `datas.length` ou uso real. |
| `valor_fixo_unico` | Idêntico a `por_periodo_completo` no cálculo — cobrado uma única vez; distinção é só de rótulo/relatório (mobilização vs. tarifa de período). |

Em todos os casos, cada `Contratacao.id` é cobrado exatamente uma vez por `calcularCustoContratacoes`
— referências indiretas repetidas (várias alocações diárias, várias datas de uso) nunca multiplicam
o custo, só a lista de `Contratacao[]` em si determina quantas cobranças existem.

**Validações defensivas do custeio** (corrigidas na auditoria da Fase 4): toda data em
`Contratacao.datas` precisa ser ISO válida e sem duplicata (uma data repetida infla
`por_dia_contratado` contando o mesmo dia duas vezes); `horasUsadasPorContratacaoId` nunca pode ter
uma chave sem `Contratacao` correspondente (chave órfã seria sub-cobrança silenciosa, nunca
sinalizada); o custo de cada contratação — e o `custoTotal` acumulado — precisa permanecer finito
mesmo quando `valor`/horas/dias são individualmente válidos (dois valores finitos grandes podem
multiplicar/somar para `Infinity`; nunca propagado sem erro).

**Recurso temporário como candidato do escalonador**: `criarCandidatoRecursoTemporario`
(`recursoTemporario.ts`) produz um `CandidatoComCapacidadeDiaria` (§4) diretamente consumível pelo
`registroCandidatos` do escalonador conjunto (§7), sem adaptação — primeira implementação de
produção desse contrato (Fases 0-3 só tinham implementações de teste). Faixas sempre
`natureza="normal"` (sem `contratacaoId`/`elegibilidade` próprios, mesma invariante de §3) — o
vínculo com o custo da contratação é feito por fora, cruzando `recursoId`/`idTemporario` com
`RecursoTemporarioCenario.contratacaoId`, nunca embutido na faixa (reservada para capacidade extra
em recursos **reais**).

## 11. Distribuições externas — representação normalizada, sem recalcular

**Decisão**: fatos operacionais reproduzíveis (o que foi alocado, onde, quando, quanto custou)
vivem em **tabelas normalizadas**, extensão do schema já existente — não em JSON solto. O
`ajuste_cenario` jsonb (§12) guarda metadado de decisão de negócio (o que foi considerado,
justificativas, impacto em terceiros, prioridade escolhida) — não fatos operacionais que a tela
precisa listar/filtrar sem recalcular.

**Extensão de `simulacao_comercial_item_distribuicoes`** (hoje `recurso_id uuid not null`, `origem
check in ('ORIGINAL','COMPATIBILIDADE')` — confirmado lendo `202608020001_...sql:180-224`):

```sql
alter table public.simulacao_comercial_item_distribuicoes
  alter column recurso_id drop not null,
  add column recurso_externo_tipo text check (recurso_externo_tipo in ('maquina_alugada','freelancer','terceirizacao')),
  add column recurso_externo_nome text,
  add column recurso_externo_referencia_id uuid references public.recursos_produtivos(id), -- produtividade herdada; null para terceirização
  add column contratacao_id text, -- referência lógica a Contratacao dentro do ajuste_cenario jsonb — não é FK, Contratacao não vira tabela própria nesta fase
  add column data_inicio_calculada date, -- só terceirização
  add column data_fim_calculada date,    -- só terceirização
  add column custo numeric;

alter table public.simulacao_comercial_item_distribuicoes
  drop constraint simulacao_comercial_item_distribuicoes_origem_check, -- nome exato a confirmar na migration real
  add constraint simulacao_comercial_item_distribuicoes_origem_chk
    check (origem in ('ORIGINAL','COMPATIBILIDADE','TERCEIRIZADO','RECURSO_TEMPORARIO')),
  add constraint simulacao_comercial_item_distribuicoes_recurso_xor_chk
    check (
      (origem in ('ORIGINAL','COMPATIBILIDADE') and recurso_id is not null and recurso_externo_tipo is null)
      or
      (origem in ('TERCEIRIZADO','RECURSO_TEMPORARIO') and recurso_id is null and recurso_externo_tipo is not null and recurso_externo_nome is not null)
    );
```

**Nova tabela — alocação diária** (o schema atual só guarda o total agregado por distribuição na
janela inteira; granularidade diária precisa de tabela própria):

```sql
create table public.simulacao_comercial_item_distribuicao_dias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  simulacao_comercial_item_distribuicao_id uuid not null references public.simulacao_comercial_item_distribuicoes(id),
  data date not null,
  horas_maquina numeric not null check (horas_maquina > 0),
  horas_padrao numeric not null check (horas_padrao > 0),
  natureza text not null check (natureza in ('normal','hora_extra','sabado','domingo','feriado')),
  constraint simulacao_comercial_item_distribuicao_dias_uniq unique (simulacao_comercial_item_distribuicao_id, data, natureza)
);
```

A tela e o snapshot reproduzem operação (via `ChaveOcorrencia`, §5), recurso (interno via
`recurso_id`, externo via `recurso_externo_*`), horas (agregadas na distribuição + detalhe diário
na tabela nova), datas (calculadas para terceirização; via `simulacao_comercial_item_distribuicao_dias`
para o resto) e custo — tudo por leitura direta, sem recalcular o motor.

**Anotações para a Fase 6** (schema real ainda não escrito — registradas aqui para não se perderem
até lá):
- Coerência `origem`×`recurso_externo_tipo` já coberta pelo
  `simulacao_comercial_item_distribuicoes_recurso_xor_chk` acima — mas falta um CHECK equivalente
  amarrando o **valor** de `recurso_externo_tipo` ao `origem` específico (`origem='TERCEIRIZADO'`
  só combina com `recurso_externo_tipo='terceirizacao'`; `origem='RECURSO_TEMPORARIO'` só combina
  com `'maquina_alugada'`/`'freelancer'`) — o XOR atual só garante presença/ausência, não a
  correspondência de valores.
- `custo` (em `simulacao_comercial_item_distribuicoes`) precisa de `check (custo is null or custo
  >= 0)`.
- Isolamento de empresa entre `simulacao_comercial_item_distribuicao_dias` e a distribuição pai:
  FK simples para `simulacao_comercial_item_distribuicao_id` não garante que `empresa_id` bate com
  o da linha pai — precisa de FK composta `(simulacao_comercial_item_distribuicao_id, empresa_id)
  references simulacao_comercial_item_distribuicoes(id, empresa_id)` (exige `unique
  (id, empresa_id)` na tabela pai) ou trigger equivalente, mesmo padrão já usado em
  `recurso_id`/`empresa_id` na própria `simulacao_comercial_item_distribuicoes` hoje.
- `simulacao_comercial_item_distribuicao_dias` precisa de RLS (`enable row level security` +
  policy de leitura por `empresa_atual_id()`) — omitida no esboço acima, mesmo padrão de todas as
  tabelas filhas de `simulacoes_comerciais`.

## 12. Persistência do cenário — versionada, auditável, completa

```ts
interface AjusteCenarioPersistido {
  versaoFormato: 1; // mesma filosofia de estimativa_metodo_versao (DEC-006)
  versaoCapacidadeUsada: number; // empresa_capacidade_versoes.versao no momento do congelamento (§14)

  capacidadeExtra: CapacidadeExtraDia[];
  contratacoes: Contratacao[]; // lista completa — não só os contratacaoId referenciados
  alocacaoDiaria: { recursoId: string; data: string; horasAlocadas: number; natureza: string }[];

  terceirizacoes: {
    chave: ChaveOcorrencia;
    fornecedor: string;
    prazoDiasCorridos: number;
    contratacaoId: string;
    dataInicioCalculada: string;
    dataFimCalculada: string;
  }[];

  recursosTemporarios: RecursoTemporarioCenario[]; // contrato completo (§10)

  prioridade: {
    base: { projetoId: string; categoria: "baixa" | "normal" | "urgente"; aprovadoEm: string }[];
    proposta: { projetoId: string; categoria: "baixa" | "normal" | "urgente"; posicao: number }[];
  };

  projetosDeslocados: ImpactoProjetoDeslocado[]; // contrato completo (§9), congelado — não recalculável depois

  reconstrucoesLegadas: {
    projetoId: string;
    recursoId: string;
    origem: OrigemDistribuicaoDiaria; // §9 — inclui confirmadaPeloUsuario quando fonte=estimativa_fifo
  }[];

  totais: { custoAdicionalTotal: number; horasExtrasOferecidas: number; horasExtrasUtilizadas: number; horasExtrasNaoUtilizadas: number };
  justificativas: { alvo: string; texto: string }[];
}
```

Substitui a versão resumida das rodadas anteriores, que referenciava `contratacaoId` solto sem
guardar as `Contratacao[]` de fato, e não incluía `versaoCapacidadeUsada`,
`prioridade.base`/`prioridade.proposta` nem `reconstrucoesLegadas`. `ajuste_cenario jsonb`
continua nullable (mesmo padrão das 4 colunas do Calculador Reverso), validação forte em
TypeScript **antes** de montar o payload — a RPC valida estrutura mínima, não o formato inteiro.

## 13. Hash de idempotência v6 — cobre o cenário inteiro

O hash autoritativo (mesmo mecanismo de `calcularHashSolicitacao` do DEC-006 — calculado depois do
recálculo autoritativo, nunca antes) passa a incluir o `AjusteCenarioPersistido` (§12) **inteiro**,
não só os campos herdados da v5:

```ts
function calcularHashSolicitacaoV6(dados: DadosHashV5 & { ajusteCenario: AjusteCenarioPersistido }): string {
  const ajusteCanonico = canonicalizarAjusteCenario(dados.ajusteCenario);
  // ordena de forma estável cada array antes do JSON.stringify — capacidadeExtra por
  // (recursoId,data,natureza); contratacoes por id; recursosTemporarios por idTemporario;
  // terceirizacoes por chaveStr(chave); projetosDeslocados por projetoId; reconstrucoesLegadas
  // por (projetoId,recursoId) — mesmo motivo do DEC-002/DEC-006: o hash não pode depender da
  // ordem em que o servidor decidiu processar os candidatos.
  const canonico = JSON.stringify({ ...canonicoV5(dados), ajusteCenario: ajusteCanonico });
  return createHash("sha256").update(canonico).digest("hex");
}
```

Qualquer mudança relevante — ajustes de capacidade extra, contratações, temporários,
terceirizações, prioridade proposta, impactos congelados, `versaoCapacidadeUsada`, resultados e
custos — muda o hash. Mesma `chaveIdempotencia` com hash diferente é rejeitada como "Conflito de
idempotência", mesmo padrão já testado E2E para a v5 (DEC-006, replay conflitante).

## 14. Concorrência — versão de capacidade por empresa

A RPC (PL/pgSQL) **não pode** reexecutar o motor TypeScript dentro de um lock — a correção não
tenta recalcular no banco, usa invalidação por versão.

```sql
create table public.empresa_capacidade_versoes (
  empresa_id uuid primary key references empresas(id),
  versao bigint not null default 1
);
```

**Leitura consistente** (janela de leitura, não uma única captura):
```ts
async function congelarBaseComVersaoConsistente(empresaId: string): Promise<BaseCongelada> {
  for (let tentativa = 0; tentativa < LIMITE_TENTATIVAS; tentativa++) {
    const versaoInicial = await lerVersaoCapacidade(empresaId);
    const base = await carregarBaseCompleta(empresaId);
    const versaoFinal = await lerVersaoCapacidade(empresaId);
    if (versaoInicial === versaoFinal) return { ...base, versaoUsada: versaoFinal };
  }
  throw new Error("Não foi possível obter leitura consistente da capacidade — tente novamente.");
}
```

Na aprovação: `select ... from empresa_capacidade_versoes where empresa_id=... for update`,
compara com `versaoUsada` enviada, rejeita se diferente ("a capacidade mudou desde que este
cenário foi calculado"), só então prossegue.

**O contador é monotônico e pode avançar várias vezes numa mesma aprovação** (trigger do pai em
`simulacoes_comerciais`, trigger dos itens, trigger das distribuições — cada INSERT/UPDATE
relevante dispara seu próprio incremento). Isso é esperado e correto — a proteção de concorrência
não depende de quantos incrementos ocorrem, só de que a versão final capturada seja diferente de
qualquer versão anterior já usada por outra leitura. **Nunca documentar como "um incremento por
aprovação".**

**Marca transacional — `vigente` só muda dentro da RPC de aprovação.** A versão anterior deste
documento permitia qualquer UPDATE direto de `true→false` (só bloqueava a reativação
`false→true`) — não cumpria a decisão por completo, porque uma desativação direta ainda passaria.
Correção: a RPC marca a transação com o projeto em andamento **antes** do `UPDATE`; o trigger
exige essa marca para **qualquer** alteração de `vigente`, não só a reativação:

```sql
-- Dentro da RPC v6, imediatamente antes do UPDATE que desativa o snapshot anterior:
perform set_config('app.aprovacao_em_andamento_projeto_id', p_projeto_id::text, true); -- true = local à transação, some no commit/rollback

create or replace function public.impedir_alteracao_vigente_sem_marca()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_marca text;
begin
  v_marca := current_setting('app.aprovacao_em_andamento_projeto_id', true);
  if v_marca is null or v_marca is distinct from old.projeto_id::text then
    raise exception 'Alteração de vigente só é permitida dentro da RPC de aprovação, para o projeto em andamento.';
  end if;
  if old.vigente = false and new.vigente = true then
    raise exception 'Reativação direta de snapshot antigo não é permitida, mesmo com a marca presente.';
  end if;
  return new;
end; $$;
-- before update of vigente on simulacoes_comerciais
```

Mesmo uma conexão com privilégio elevado só consegue alterar `vigente` se antes tiver setado a
marca transacional com o `projeto_id` exato da linha — o que só a própria RPC faz, no momento
certo.

**Imutabilidade do conteúdo — comparação de todas as colunas, sem enumerar manualmente.** A
comparação campo a campo da versão anterior omitia justamente os campos novos desta entrega
(`ajuste_cenario`, `custo_adicional_total`) e esqueceria qualquer coluna futura. Corrigida para
comparar o registro inteiro via `to_jsonb`, com `vigente` como única exceção explícita — cobre
automaticamente qualquer coluna presente na tabela, inclusive as que ainda não existem hoje, sem
precisar ser reeditada a cada campo novo:

```sql
create or replace function public.impedir_alteracao_conteudo_snapshot()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (to_jsonb(old) - 'vigente') is distinct from (to_jsonb(new) - 'vigente') then
    raise exception 'Conteúdo do snapshot aprovado é imutável — só vigente pode mudar, e só pela RPC de aprovação.';
  end if;
  return new;
end; $$;
-- before update on simulacoes_comerciais (roda em conjunto com o trigger de marca acima)
```

**Filhos do snapshot** — `simulacao_comercial_itens`/`simulacao_comercial_item_distribuicoes`/
`simulacao_comercial_item_distribuicao_dias` (§11): nunca são atualizadas hoje (confirmado lendo a
RPC v5 — só `insert`) → trigger que rejeita **qualquer** UPDATE/DELETE, sem exceção:

```sql
create or replace function public.impedir_alteracao_snapshot_filho()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  raise exception 'Tabela append-only — UPDATE/DELETE não permitidos em %.', TG_TABLE_NAME;
end; $$;
-- before update or delete on simulacao_comercial_itens / simulacao_comercial_item_distribuicoes / simulacao_comercial_item_distribuicao_dias
```

A ACL (RLS + `revoke`/`grant`) continua sendo a primeira linha de defesa (`authenticated` não tem
UPDATE direto nessas tabelas hoje — só o client `service_role`, via RPC `SECURITY DEFINER`); os
triggers acima são a segunda linha, explícita, independente de quem está executando.

**Inventário completo de gatilhos de versão** (rastreado por leitura direta de
`prepararEntradasMotor.ts`, `resolverBomAtivo.ts`, `coletarEstruturaBom.ts`,
`calcular_produtividade_efetiva`, `calcular_comprometido_v2` — não presumido):

| Tabela | Colunas/eventos |
|---|---|
| `projeto_itens` | `produto_id`, `quantidade`, `ativo`, `deleted_at` |
| `boms` | `produto_id`, `status`, `ativo`, `deleted_at` |
| `bom_operacoes` | `bom_id`, `ordem`, `tempo_estimado_minutos`, `recurso_produtivo_id`, `ativo`, `deleted_at` |
| `bom_itens` | `bom_id`, `componente_tipo`, `componente_produto_id`, `materia_prima_id`, `quantidade`, `ativo`, `deleted_at` |
| `bom_operacao_dependencias_subconjunto` | INSERT/UPDATE/DELETE |
| `itens_industriais` | `ativo`, `deleted_at` |
| `materias_primas` | `ativo`, `deleted_at` |
| `recursos_produtivos` | `capacidade_horas_dia`, `produtividade`, `grupo_id`, `ativo`, `deleted_at` |
| `grupos_recursos` | `produtividade_padrao`, `ativo`, `deleted_at` |
| `recurso_produtivo_compatibilidades` | `recurso_origem_id`, `recurso_destino_id`, `prioridade`, `ativo`, `deleted_at` |
| `simulacoes_comerciais` | INSERT **e** UPDATE de `vigente` |
| `simulacao_comercial_itens`, `simulacao_comercial_item_distribuicoes`, `simulacao_comercial_item_distribuicao_dias` | INSERT |
| `projetos` | `situacao_comercial`, `prioridade`, `data_objetivo`, `ativo`, `deleted_at` |
| `calendario_oficial_feriados`, `calendario_operacional_empresa`, `calendario_empresa_eventos` | qualquer mudança |
| `ordens_producao`, `operacoes_producao` | qualquer mudança (dependência nova, introduzida por §9 — reconstrução de distribuição diária real e `producaoIniciada`) |

**Criação/backfill**: `insert into empresa_capacidade_versoes select id, 1 from empresas` na mesma
migration que cria a tabela; trigger `after insert on empresas` cria a linha para empresas
futuras.

## 15. Segurança — search_path, ACL, isolamento por empresa

Toda função e trigger novos desta entrega: `set search_path to 'public'` fixo (mesmo padrão já
usado em `aprovar_projeto_com_simulacao_v5`), `revoke all ... from public, anon` seguido de
`grant` mínimo explícito ao papel que realmente precisa (`authenticated` só para leitura via RLS;
`service_role` só para as RPCs `SECURITY DEFINER` que escrevem), e toda consulta/gravação
filtrada por `empresa_id` (RLS ou `empresa_atual_id()`), sem exceção.

## 16. Fronteira com o PCP — sem reprogramação automática

Nada nesta entrega escreve em `ordens_producao`/`operacoes_producao`. O impacto em projetos
deslocados (§9) é **puramente informacional** — nunca atualiza status, cronograma ou dado real de
outro projeto. Se o orçamentista decidir agir sobre essa informação, é uma ação humana separada,
fora desta funcionalidade — mesmo princípio já vigente em `PAD-008`/`ARQUITETURA_VIGENTE...`
("a Simulação verifica SE é possível produzir; o PCP decide COMO produzir").

## 17. Riscos residuais conhecidos, aceitos nesta versão

- Versão única por empresa serializa **todas** as aprovações da empresa, mesmo as que não
  competem pelo mesmo recurso — corretude priorizada sobre paralelismo; granularizar por recurso
  fica para uma evolução futura se isso virar gargalo real.
- Regra 2 de precedência (subconjunto→pai) sem vínculo mestre informado usa fallback conservador,
  que pode ser pessimista em roteiros onde só a montagem final depende do subconjunto.
- Modelo de precedência é uma cadeia linear por `bom_id` — roteiros com ramos paralelos reais não
  são representados; limitação declarada, não escondida.
- Granularidade exclusivamente diária — não representa aproveitamento de fração de dia entre
  predecessora e sucessora; exigiria granularidade por horário, fora desta entrega.

## 17.1 Fase 6 — desenho de schema, correções contra o schema real e decisões de escopo

Migration escrita (`supabase/migrations/202608110001_cenarios_schema_fase6.sql`, único
arquivo/transação) e roteiro de testes separado, dividido em 4 scripts independentes
(`supabase/tests/fase6_cenarios_teste_1_estrutura.sql`, `_2_precedencia_versao.sql`,
`_3_snapshots_imutabilidade.sql`, `_4_integracao_rpc.sql` — ver "3ª rodada" abaixo para o motivo da
divisão), cada um `BEGIN...ROLLBACK` autocontido, nunca implantado — **nada foi aplicado
definitivamente a nenhum banco**; aplicação real exige autorização separada por execução (Regra 9),
após os 4 scripts passarem no remoto. Os scripts de teste vivem fora de `supabase/migrations/`
deliberadamente — uma primeira versão (então um único arquivo) ficou no mesmo diretório com prefixo
`202608110001_`, seguindo o padrão `YYYYMMDDNNNN` de nome de migration; auditoria apontou o risco de
ser detectado por `supabase db push` (ou qualquer ferramenta que varra o diretório por nome numérico)
e de colidir com a versão da migration real — corrigido movendo para `supabase/tests/`, fora desse
padrão.

**P0 corrigido nesta fase — a migration, como escrita originalmente, quebrava a RPC
`aprovar_projeto_com_simulacao_v5` (já em produção)**: o trigger `impedir_alteracao_vigente_sem_marca`
(§14) exige `set_config('app.aprovacao_em_andamento_projeto_id', ...)` antes de qualquer UPDATE de
`vigente` e bloqueia **incondicionalmente** qualquer transição `false→true`, mesmo com a marca
presente. A v5 original insere o novo snapshot com `vigente=false` e só depois faz
`UPDATE ... SET vigente=true` — exatamente a transição bloqueada, e sem nunca setar a marca. Sem
correção, a primeira aprovação via v5 após a migration falharia. Resolvido por compatibilização (não
por adiamento junto da v6/Fase 9): a própria migration da Fase 6 reescreve a v5
(`create or replace function`, mesma assinatura, nenhuma validação/mensagem/retorno/garantia de
idempotência pré-existente alterada) para:
- Travar por projeto (`pg_advisory_xact_lock`, mesma chave/padrão de
  `202608040001_bom_subconjunto_protecao_ciclo.sql`) antes de tocar em `vigente`, serializando
  aprovações concorrentes do mesmo projeto.
- Re-checar idempotência **sob a trava** (autoritativa) imediatamente antes de qualquer escrita —
  além da checagem otimista original (mantida, antes da validação pesada de itens). Sem essa
  re-checagem, duas chamadas concorrentes com a mesma `chave_idempotencia` podiam ambas passar pela
  checagem otimista antes de qualquer uma confirmar; a segunda, ao adquirir a trava depois que a
  primeira já havia comitado, desativaria por engano o snapshot que a primeira acabara de ativar.
- Setar a marca transacional e desativar o snapshot antigo (`true→false`) **antes** do INSERT do
  novo.
- Inserir o novo snapshot já com `vigente=true` diretamente — nunca mais via UPDATE de ativação
  separado, o que elimina de vez a transição `false→true` que o trigger bloqueia.

Efeito observável para quem chama a v5: nenhum (mesma assinatura, mesmos erros, mesmo retorno, mesmo
estado final). Validado por um teste de regressão de ponta a ponta novo (Teste 12 do script de teste)
que chama a RPC real após o schema instalado: snapshot novo nasce vigente=true e o antigo é
desativado; replay idêntico (mesma `chave_idempotencia`/hash) não escreve em `vigente` nem cria linha
nova; replay conflitante (mesma chave, hash diferente) é rejeitado sem nenhuma escrita.

**Outras correções do mesmo ciclo de auditoria, no script de teste**: Teste 5 (validações de campo de
`bom_operacao_dependencias_subconjunto`) declarava sucesso mesmo quando a inserção era aceita "por
acaso" pelo fixture disponível — reescrito para forçar deterministicamente um mismatch de
`componente_tipo` (item do mesmo `bom_id` da operação, mas não-subconjunto) e um caso positivo
igualmente determinístico. Teste 8 (`ajuste_cenario`/`custo_adicional_total`) testava via UPDATE numa
linha existente — barrado primeiro pela imutabilidade de conteúdo (`impedir_alteracao_conteudo_snapshot`,
que reage a qualquer UPDATE, não só a `vigente`), nunca exercitando de fato a CHECK que dizia testar
— reescrito para inserir uma linha nova diretamente (a imutabilidade só se aplica a UPDATE), com
confirmação de que o erro capturado é especificamente da CHECK esperada. Teste 10 (isolamento de
versão entre empresas) comparava a versão de cada outra empresa contra ela mesma e nunca usava o
resultado na asserção final — reescrito para capturar antes/depois de todas as outras empresas e
comparar os dois arrays. Teste 4 só cobria 2 das 3 tabelas filhas append-only — Teste 4c adicionado
para `simulacao_comercial_item_distribuicao_dias`. `trg_empresas_criar_capacidade_versao()` ficou
com o EXECUTE padrão de PUBLIC — corrigido com o mesmo `revoke` mínimo aplicado a toda outra função
de trigger da migration.

**2ª rodada de auditoria — mais 1 P0 e 2 P1, todos corrigidos antes de qualquer execução remota**:
- **P0 — a RPC `aprovar_projeto_com_simulacao_v4` (caminho de ROLLBACK documentado, "aditiva sobre a
  v4, que permanece intacta") tinha exatamente o mesmo problema estrutural que a v5 original**: insere
  o snapshot com `vigente=false` e ativa via `UPDATE...SET vigente=true` sem marca — o mesmo trigger
  que quebraria a v5 quebraria a v4, tornando o rollback documentado inutilizável exatamente quando
  precisaria funcionar. Corrigido pelo mesmo padrão da v5 (§9.2 da migration): `create or replace` da
  v4 com a assinatura original de 13 parâmetros (a v4 nunca teve os 4 campos de estimativa da v5),
  trava por projeto, re-checagem de idempotência sob a trava, marca transacional, snapshot novo já
  nascendo `vigente=true`. Validado por um teste de regressão de ponta a ponta dedicado (Teste 13,
  espelhando o Teste 12) chamando a v4 real após o schema instalado.
- **P1 — TERCEIRIZADO aceitava linha diária indevida**: o modelo (§10) diz que `TERCEIRIZADO` opera só
  pelas datas calculadas (`data_inicio_calculada`/`data_fim_calculada` na distribuição pai), sem
  alocação diária — mas `simulacao_comercial_item_distribuicao_dias` aceitava qualquer distribuição
  pai, inclusive terceirizada, sem validação (a CHECK da tabela não alcança a distribuição pai —
  Postgres não permite subquery entre tabelas em CHECK). Corrigido com um novo trigger
  (`validar_distribuicao_dia_origem`, `before insert`) que rejeita qualquer linha diária cujo pai
  tenha `origem='TERCEIRIZADO'`, com teste específico (Teste 7d).
- **P1 — Teste 5 ainda podia pular candidatos existentes**: a 1ª correção escolhia a operação primeiro
  e só depois procurava item no `bom_id` dela — podia pular um vínculo válido mesmo havendo outro BOM
  adequado no ambiente. Corrigido selecionando operação+item **juntos por JOIN** (5a e 5b são buscas
  independentes, cada uma percorrendo todos os `bom_operacoes`/`bom_itens` do ambiente de uma vez, não
  só o `bom_id` da primeira operação encontrada).
- **Recomendação aplicada — Teste 12 fortalecido**: além de conferir `vigente=true`/`false`, agora
  captura contagens de `simulacoes_comerciais`/`simulacao_comercial_itens`/
  `simulacao_comercial_item_distribuicoes` e `aprovado_em` do próprio snapshot antes/depois do replay
  idêntico, provando que o replay não escreve **nada** (não só que `vigente` não mudou).

**3ª rodada — execução real revelou erro de existência (não só de nome) no inventário §14**: a primeira
tentativa de `BEGIN...ROLLBACK` no remoto falhou no item 8.20 (`operacoes_producao`) - diferente das
correções de nome já feitas (`ordens_producao`→`ordens_fabricacao`), desta vez a tabela **não existe
de forma alguma**, nem como equivalente com outro nome. Preflight somente leitura confirmou via
`information_schema.tables` (filtro `%oper%`/`%ordem%`/`%apont%`/`%aloc%` em `public`): só existem
`bom_operacoes` (tabela de ROTEIRO/cadastro, não de execução - nunca foi um candidato correto para
este trigger), `calendario_operacional_empresa` (já coberta por outro item do inventário) e 2 views
(`vw_of_fluxo_operacional`, `vw_planejamento_compras_operacional` - não recebem trigger de escrita).
Não há, hoje, nenhuma tabela de "operação de produção" (granularidade abaixo de `ordens_fabricacao`)
no schema real. Corrigido removendo o item 8.20 do inventário da migration (§8, com nota explicando a
ausência) - **inventário nominal passa de 20 para 19 triggers**; se essa tabela vier a existir numa
fase futura, o trigger correspondente deve ser adicionado então, nunca presumido antes de a tabela
existir. Confirmado por leitura pós-falha (`to_regclass`/`information_schema.columns` para as 4
estruturas novas desta migration) que o `ROLLBACK` implícito de Postgres ao erro não deixou nenhum
resíduo - transação abortada de forma limpa.

**Divisão do roteiro de testes em 4 scripts independentes** (a migration deployável continua em
arquivo único/transação única - só o roteiro de testes foi dividido, para isolar falhas e permitir
reexecução parcial sem repetir tudo): `supabase/tests/fase6_cenarios_teste_1_estrutura.sql` (tabelas,
colunas, constraints, índices, FKs, backfill, RLS), `_2_precedencia_versao.sql` (dependência de
subconjunto, ciclo, triggers de incremento de versão), `_3_snapshots_imutabilidade.sql`
(distribuições, dias, origem terceirizada, conteúdo congelado, regras de `vigente`),
`_4_integracao_rpc.sql` (RPCs v4/v5 reais, idempotência, replay, contagens - validação de ponta a
ponta da migration completa e integrada). Cada script é `BEGIN...ROLLBACK` autocontido.

**`supabase/baseline/` não é o schema real** — é uma reescrita paralela nunca aplicada ao projeto
(confirmado no próprio `supabase/baseline/README.md`). Usá-la como fonte de verdade produziu pelo
menos 2 erros reais durante o desenho desta fase (nome de constraint, nome de coluna). A partir da
Fase 6, qualquer decisão de schema se baseia em `supabase/migrations/*.sql` (cronológico) +, quando
a `CREATE TABLE` original não está rastreada nas migrations, no uso real em `src/` como segunda
fonte — nunca em `supabase/baseline/`.

**Correções do inventário §14 contra o schema real**: a tabela chamada "ordens_producao" no texto
original é `ordens_fabricacao`; `recursos_produtivos.grupo_id` e `.capacidade_horas_dia` existem
como escritos (não precisavam de correção, ao contrário do que uma checagem inicial contra baseline
sugeriu); `bom_itens.componente_tipo`/`.ativo` e `projetos.ativo`/`projeto_itens.ativo` já existiam
nas `CREATE TABLE` originais. `unique(id, empresa_id)` só existia, antes desta migration, em
`recursos_produtivos` e `simulacao_comercial_itens` — adicionada nesta migration em `bom_operacoes`,
`bom_itens` e `simulacao_comercial_item_distribuicoes`, pré-requisito das FKs compostas.
`calendario_oficial_feriados` não tem `empresa_id` (tabela global) — único trigger do inventário que
incrementa a versão de **todas** as empresas, não de uma só (função irmã dedicada).

**Decisões confirmadas com o usuário, além do que o DEC-007 original especificava**:
- Estados da estimativa **método v2** (`viavel`/`viavel_no_limite`/`prazo_inviavel`, eixo prazo) são
  distintos dos estados do método v1 (`viavel`/`viavel_no_limite`/`janela_insuficiente`, eixo
  material) na mesma CHECK — 2 colunas novas exclusivas do v2 (`estimativa_data_fim_real`,
  `estimativa_folga_dias_civis`, esta em **dias civis**, nunca confundida com
  `folga_dias_produtivos` do v1); `janela_insuficiente` permanece exclusivo de snapshots v1.
- `ajuste_cenario`/`custo_adicional_total` (§12) ganham CHECK de coerência (objeto JSON,
  `versaoFormato=1`, custo não-negativo, custo denormalizado batendo com `ajuste_cenario.totais.custoAdicionalTotal`).
- Vínculo por `empresa_id` reforçado com FK composta em toda relação nova onde possível
  (dependência de subconjunto, distribuição externa→recurso de referência, dia→distribuição pai) —
  não só na tabela de dias, como o esboço original previa.
- `simulacao_comercial_item_distribuicoes`: CHECKs completos por `origem` — correspondência de
  valor `recurso_externo_tipo`×`origem` (gap que o próprio §11 já sinalizava), `contratacao_id`
  obrigatório/nulo por origem, datas calculadas só para `TERCEIRIZADO` (ambas ou nenhuma, fim≥início),
  e as 9 colunas de capacidade dia-a-dia viraram **nullable**, obrigatórias para
  `ORIGINAL`/`COMPATIBILIDADE`/`RECURSO_TEMPORARIO`, nulas para `TERCEIRIZADO` (0 significaria
  capacidade real nula; aqui o conceito não se aplica) — representado em TypeScript como união
  discriminada por `origem` (`distribuicaoItemLinha.ts`, Fase 6) para impedir acesso a campo de
  capacidade sem antes estreitar o tipo.
- `simulacao_comercial_item_distribuicao_dias` ganhou `contratacao_id` própria (o esboço original do
  §11 só tinha na tabela pai) — espelha a invariante já implementada em `alocarOperacaoDiaAdia.ts`
  (Fase 0): `natureza='normal' ⟺ contratacaoId nulo`. Todo `contratacao_id` (pai ou dia) precisa
  existir em `ajuste_cenario.contratacoes` — validado autoritativamente pela RPC v6 (Fase 9), não
  checável por `CHECK` (não enxerga jsonb de outra linha/coluna de forma prática); o hash de
  idempotência v6 (Fase 9) também precisa incluir o `contratacao_id` de cada dia.

## 17.2 Fase 6 — validação remota (BEGIN...ROLLBACK) concluída nos 4 scripts

Duas rodadas adicionais de correção, encontradas só na execução real contra o remoto (não visíveis em
leitura de código nem nas 3 rodadas de auditoria anteriores):

- **4 nomes de CHECK excediam 63 bytes** (`NAMEDATALEN` do Postgres) e teriam sido truncados
  silenciosamente na criação — descoberto pelo Teste 1 (estrutura), que comparava o nome esperado
  contra `pg_constraint` e não encontrou o nome completo. Corrigido encurtando os 4 nomes na própria
  migration (removido `_por` do meio, sem perda de significado, todos ≤61 caracteres, checados um a
  um contra colisão com os demais ~19 nomes do inventário): `..._referencia_origem_chk`,
  `..._contratacao_origem_chk`, `..._capacidade_origem_chk` (mesma tabela,
  `simulacao_comercial_item_distribuicoes`) e `simulacao_comercial_item_distribuicao_dias_nat_contrato_chk`.
- **Erro 42883 (função não encontrada) no Teste 4** ao chamar `aprovar_projeto_com_simulacao_v5` —
  causa real: literais passados sem tipo explícito (ex.: `1` para o parâmetro `smallint`) deixavam a
  resolução de overload do Postgres ambígua. Corrigido com CAST explícito em **todos** os argumentos
  das 6 chamadas (3 na v5, 3 na v4) para o tipo exato de cada parâmetro, e um PRE-CHECK novo no início
  do Teste 4 (`to_regprocedure` contra a assinatura completa esperada de v5 e v4) que agora falha
  cedo, com mensagem clara, se a migration e os testes algum dia divergirem de novo.

**Os 4 scripts de teste (`supabase/tests/fase6_cenarios_teste_1_estrutura.sql` a
`_4_integracao_rpc.sql`) rodaram com sucesso no banco remoto, cada um em sua própria transação
`BEGIN...ROLLBACK`, confirmando**: as 3 tabelas novas + colunas/constraints/índices/RLS das 2 tabelas
estendidas (Teste 1); dependência de subconjunto, isolamento de versão por empresa, FK composta
cross-tenant e as 19 triggers nominais (Teste 2); marca transacional, imutabilidade de conteúdo,
append-only nas 3 tabelas filhas, CHECKs de capacidade/dia por origem e rejeição de dia com pai
`TERCEIRIZADO` (Teste 3); e — o mais crítico — as RPCs reais `aprovar_projeto_com_simulacao_v5` e
`v4` funcionando de ponta a ponta com o novo trigger de marca, replay idêntico sem nenhuma escrita e
replay conflitante rejeitado (Teste 4). Confirmado por leitura em nova conexão, após cada execução,
que o `ROLLBACK` não deixou resíduo.

**Migration ainda não aplicada definitivamente a nenhum banco** — aplicação real segue pendente de
autorização separada por execução (Regra 9), com plano de aplicação apresentado ao usuário
separadamente desta auditoria.

## 17.3 Fase 6 — migration aplicada em produção (2026-08-12)

Após pré-checagem de leitura (resíduo zero nos 4 campos, nenhuma migration com versão ≥
`202608110001` já registrada), o usuário autorizou a aplicação real, executada via SQL Editor (não
`supabase db push`, conforme o próprio cabeçalho da migration determina) em janela sem uso do
sistema. Verificação pós-aplicação, por leitura, confirmou:

- as 3 tabelas novas existem (`empresa_capacidade_versoes`, `bom_operacao_dependencias_subconjunto`,
  `simulacao_comercial_item_distribuicao_dias`);
- a coluna `ajuste_cenario` existe em `simulacoes_comerciais`;
- **19** triggers de incremento de versão instalados (inventário nominal correto, sem o item
  `operacoes_producao` removido em §17.1/§17.2);
- backfill de `empresa_capacidade_versoes` bateu 1:1 com `empresas` (2 linhas para 2 empresas).

**Pendente, cada um com autorização própria, ainda não concedida**: `supabase migration repair`
(sincronizar o histórico de migrations do CLI, já que a aplicação foi manual); commit dos arquivos
(migration + 4 scripts de teste + este documento); push; deploy.

## 17.4 Fase 7 — aplicação acidental, auditoria e teste funcional (2026-08-12)

**Incidente**: durante a preparação do teste `BEGIN...ROLLBACK` da Fase 7, o arquivo colado no SQL
Editor foi, por engano, a própria migration `202608120001_bom_dependencia_subconjunto_fase7.sql` — não
o script de teste. A migration tem seu próprio `begin;`/`commit;` (padrão de todas as migrations deste
projeto); o `commit;` finalizou a transação e persistiu as mudanças de verdade, sem passar pelo
checkpoint de confirmação por execução (Regra 9) nem por validação prévia em `BEGIN...ROLLBACK`. O
usuário identificou o problema pela consulta de resíduos (constraint e índice novos presentes, índice
antigo ausente) antes de qualquer outra ação, e determinou parar imediatamente para auditar antes de
decidir qualquer correção.

**Auditoria pós-aplicação (só leitura, 2 rodadas)** confirmou que o schema realmente aplicado bate
**exatamente** com o arquivo da migration, sem nenhum desvio de conteúdo: 9 colunas (idênticas à
Fase 6); 7 constraints (5 FK + 1 PK + o novo CHECK `ativo_sempre_true_chk`); 5 índices (`pkey`,
`empresa_idx`, `item_idx`, `operacao_idx` inalterados da Fase 6, `item_vivo_uniq` novo presente,
`par_vivo_uniq` antigo **ausente**, confirmando a reindexação em 3 passos); 3 triggers (`validar` e
`bump_capacidade_versao` da Fase 6 inalterados, `validar_atualizacao_dependencia_subconjunto` novo, com
corpo idêntico byte a byte ao arquivo); 3 policies (`select_tenant` da Fase 6 + `insert`/`update`
novas, **nenhuma de `DELETE`**, confirmando a decisão de desenho de §6.1); RLS habilitado; 0 linhas na
tabela (nenhum dado de negócio em risco); nenhuma tabela temporária de teste residual;
`202608120001` ausente do ledger de migrations do CLI (`supabase migration list --linked` mostra
Local preenchido, Remote vazio) — esperado, já que a aplicação foi manual via SQL Editor, não
`supabase db push`.

**Achado colateral, não causado pelo incidente**: os dois nomes de policy novos, como escritos na
migration, têm 66 bytes (`"nexotfe bom operacao dependencias subconjunto insert/update mesma
empresa"`) — excedem o limite de identificador do Postgres (`NAMEDATALEN`=64, 63 bytes utilizáveis) e
foram truncados silenciosamente para 63 bytes na criação (`..."mesma empr"`). Isso teria ocorrido
exatamente assim mesmo se a migration tivesse sido aplicada pelo fluxo correto — não é efeito da
aplicação acidental. Sem efeito funcional (RLS continua avaliando `using`/`with check` corretamente,
os dois nomes truncados continuam distintos entre si) — só cosmético. Correção tratada como migration
separada (abaixo), nunca editando silenciosamente uma migration já aplicada.

**Teste funcional Tier A reescrito e executado com sucesso.** A versão anterior de
`fase7_dependencia_subconjunto_teste.sql` reproduzia o corpo inteiro da migration (para testar contra
DDL ainda não aplicado) — reproduzia, portanto, o próprio `commit;` que causou o incidente. Reescrito
para **um único `begin;` no topo, um único `rollback;` no fim, zero `commit;` executável**, testando
diretamente o schema já aplicado (sem replicar DDL nenhum). Executado pelo usuário: os 10 cenários
passaram (`Success. No rows returned`), cobrindo CHECK `ativo=true`, INSERT/troca/remoção lógica pelo
criador (JWT simulado), unicidade por subconjunto, proteção de auditoria (`created_by`/`empresa_id`/
`bom_item_id`/`ativo` imutáveis), rejeição de troca+remoção no mesmo `UPDATE`, rejeição de restauração
direta, e RLS negando usuário sem permissão. Contagem de linhas antes/depois do teste: 0/0 — nenhum
resíduo.

**Correção dos nomes de policy — preparada, ainda não aplicada nem testada**: migration
`202608120002_fix_nomes_policies_fase7.sql` usa `ALTER POLICY ... RENAME TO` (troca só o identificador,
`using`/`with check`/roles/comando permanecem exatamente os já aplicados, sem risco de divergência de
uma recriação manual) para os nomes novos, encurtados para 53 bytes cada, mesma convenção
`"nexotfe {tabela} {ação} mesma empresa"` do resto do schema:
`"nexotfe dependencias subconjunto insert mesma empresa"` e
`"...update mesma empresa"`. Teste dedicado `supabase/tests/fase7_fix_policy_names_teste.sql`
(`BEGIN...ROLLBACK`, único `begin;`/`rollback;`, zero `commit;`) compara `cmd`/`roles`/`qual`/
`with_check` capturados antes e depois da renomeação, campo a campo, e confirma que o total de
policies na tabela permanece 3.

**Pendente, cada um com autorização própria, ainda não concedida**: revisão do SQL da correção pelo
usuário; execução do teste `BEGIN...ROLLBACK` da correção; `supabase migration repair` (cobrindo tanto
`202608120001` quanto, se aprovada, `202608120002`); commit dos arquivos; push; deploy.

**Atualização (2026-08-12, mesmo dia)**: a correção `202608120002` foi aplicada de fato — por um
segundo desvio de arquivo colado no SQL Editor (mesma classe do incidente original: a migration, que
termina em `commit;` real, em vez do script de teste `BEGIN...ROLLBACK`), confirmado pelo usuário após
notar que a consulta pós-execução já mostrava os nomes novos de forma permanente. Auditoria de leitura
comparando `cmd`/`roles`/`qual`/`with_check` das duas policies contra os valores capturados antes da
renomeação confirmou: nenhum campo mudou além do nome, 3 policies no total, nenhuma de `DELETE`, nomes
antigos truncados ausentes. `supabase migration repair --status applied` executado para as duas
versões (`202608120001` e `202608120002`), uma de cada vez, cada uma com autorização e verificação por
leitura (`supabase migration list --linked`) separadas — ledger do CLI hoje alinhado com o estado real
do banco para as duas.

## 17.5 Fase 7 — validação E2E real pela interface (2026-08-12)

Validação E2E autorizada e executada pelo usuário no roteiro real do produto `6158-02`, subconjunto
**`02-6158-03-01`** (único subconjunto ativo deste roteiro), pela interface real (`RoteiroForm.tsx` /
`useRoteiro.ts` / `trocarVinculoSubconjunto.ts`). **Escopo real do que foi executado nesta validação —
só o caminho de criação**: selecionar a operação **OP30 — soldar estrutura** no seletor "Necessário
antes de" (INSERT); recarregar a página (F5, recarga real, não estado otimista de tela); confirmar que
OP30 permaneceu selecionada; confirmar por leitura direta no banco exatamente **1 linha ativa**
(`deleted_at is null`) para este subconjunto, vinculada a OP30.

**Troca (UPDATE atômico para outra operação) e remoção lógica (`deleted_at`/`deleted_by`) NÃO foram
exercitadas pela interface real nesta validação** — o roteiro original prevendo criar → trocar →
remover → recriar → remover foi interrompido logo após a criação: o usuário confirmou que OP30 —
soldar estrutura já é a configuração real e correta deste roteiro, e decidiu não prosseguir com
trocar/remover/recriar apenas para exercitar o teste, preservando o dado real como está. Troca e
remoção lógica continuam cobertas — **só pelos testes automatizados**: Tier A SQL
(`fase7_dependencia_subconjunto_teste.sql`, Testes 3/4/6/7/8/9, `BEGIN...ROLLBACK`) e
`trocarVinculoSubconjunto.test.ts` (payload exato de cada UPDATE, contra cliente injetado, sem banco
real). Não confundir com validação E2E pela interface real, que aqui cobriu apenas criação.

**Isso fecha a Fase 7 na camada de cadastro/interface** — criação validada com dado real de produção
pela interface (esta seção), troca/remoção lógica/auditoria/unicidade/RLS validadas pelo Tier A SQL e
por `trocarVinculoSubconjunto.test.ts` (não pela interface real), tradução linha crua→motor coberta
por `mapearVinculosSubconjunto.test.ts` (Tier C) — **ainda não fecha integração com o motor**: ver
§6.1, `mapearVinculosSubconjunto.ts` continua sem nenhum chamador real dentro do sistema; essa ligação
(consultar a tabela → mapear → alimentar `construirGrafoOcorrencias` numa simulação de verdade)
permanece trabalho de uma fase de integração do motor ainda não desenhada.

## 18. Fases de implementação — dependências e critérios objetivos de conclusão

| Fase | Escopo | Depende de | Critério objetivo de conclusão |
|---|---|---|---|
| **0 — Fundação do motor diário** | Conversores de unidade, `capacidadeDia` (normal/extra/sobrecarga), candidato com faixas por natureza (`normal`/`hora_extra`/`sabado`/`domingo`/`feriado`) e elegibilidade, `alocarOperacaoDiaAdia`, `ChaveOcorrencia`, validação defensiva (NaN/infinito/negativo/datas), tolerância única de ponto flutuante | — (núcleo puro) | Testes: conversão de unidade ida/volta sem perda; ordem data-externa/candidato-interno com candidato de disponibilidade restrita; normal sempre consumida antes de extra; elegibilidade de extra respeitada (projeto fora do escopo nunca consome, mesmo com déficit); déficit fantasma por resíduo de ponto flutuante nunca ocorre; produtividade/horas/datas inválidas rejeitadas explicitamente; id de candidato duplicado rejeitado; saldo compartilhado entre 2 ocorrências do mesmo candidato provado; 2 cenários independentes não se contaminam |
| **1 — Grafo de precedência** | `DependenciaOcorrencia`, predecessora por ordenação (não N−1), expansão de `bom_operacao_dependencias_subconjunto`, validação de ciclo (DFS 3 cores), semântica de datas | Fase 0 | Testes: ordens espaçadas (10/20/30) resolvem corretamente; múltiplas predecessoras (vários subconjuntos); ciclo detectado e rejeitado; fallback conservador sem vínculo mestre; duração inclusiva |
| **2 — Escalonador conjunto** | Fila de prontos (Kahn+prioridade), bloqueio por predecessora com déficit, calendário compartilhado, extensão além do prazo | Fase 0+1 | Testes: zero double-booking entre 2 projetos; déficit numa predecessora bloqueia toda a descendência; grade estende até fechar ou horizonte técnico; exemplo B×Y do §7.1 como regressão fixa |
| **3 — Calculador Reverso estendido** | D* via varredura linear regressiva (§8.1 — não busca binária, monotonicidade refutada por contraexemplo) rodando o escalonador conjunto por candidata, grade/candidatos novos por tentativa; separação formal `dataFimReal`×D*; estados v2 (§8.2), `janela_insuficiente` preservado exclusivo do v1 | Fase 2 | Testes: `prazo_inviavel` nunca confundido com `horizonte_tecnico_excedido`; D* sem concorrência bate com o Calculador Reverso atual (não regressão); limite exato/1 dia antes/depois; contraexemplo de não-monotonicidade como regressão fixa; independência entre tentativas |
| **4 — Contratos de cenário + custeio** | `Contratacao` + `calcularCustoContratacoes` (fórmula por `abrangencia`, §10); `RecursoTemporarioCenario` + `criarCandidatoRecursoTemporario` (produtividade herdada, disponibilidade diária); `calcularDatasTerceirizacao`. `AjusteDeCenario`/`AjusteCenarioPersistido` completo (com campos de persistência) adiado para a Fase 6, quando o schema real existir | Fase 0-3 | Testes: custo nunca duplicado por contratação; produtividade sempre herdada; disponibilidade diária respeitada; recurso temporário consumível pelo escalonador sem adaptação; terceirização em dias corridos com precedência exata |
| **5 — Troca de prioridade** | `encontrarProjetosConectados` (travessia com `visited`, §9.1); `construirImpactosProjetosDeslocados` (`ImpactoProjetoDeslocado`, `dStarAnterior`/`dStarNovo` injetados por fora); `estimarDistribuicaoFifoLegada` (`{ fonte: "estimativa_fifo_legado", resultados, statusGlobal }` — só a aritmética, leitura de `ordens_producao` e confirmação de UI ficam para a Fase 9) | Fase 2-4 | Testes: estado nunca melhora ao perder capacidade (exemplo concreto, não invariante de runtime); travessia com `visited` sem corte arbitrário (cadeia real de 50 projetos resolve por inteiro); déficit da estimativa FIFO nunca escondido; `fonte` presente em toda saída (completa ou parcial); `statusGlobal="parcial"` bloqueia aprovação independente de confirmação de proveniência; exemplo B×Y adaptado como regressão fixa |
| **6 — Migration de schema** | `empresa_capacidade_versoes`+backfill, `bom_operacao_dependencias_subconjunto` (índice único parcial por empresa+`deleted_at`, RLS, FK composta), extensão de `simulacao_comercial_item_distribuicoes` (CHECKs completos por `origem`, capacidade nullable) + `simulacao_comercial_item_distribuicao_dias` (com `contratacao_id` própria e trigger rejeitando dia quando o pai é `TERCEIRIZADO`) (§11), `ajuste_cenario`/`custo_adicional_total` + estados v1/v2 (§12), triggers de versão (inventário nominal §14, corrigido contra o schema real - 19 triggers, não 20: item "operacoes_producao" removido, tabela não existe) e de imutabilidade (marca transacional + comparação por `to_jsonb`), compatibilização de **v4 e v5** com o trigger de marca (trava por projeto + re-checagem de idempotência sob a trava + insert já vigente=true), `search_path`/ACL em tudo, **uma única transação** - decisões e correções completas em §17.1/§17.2/§17.3 | Fase 1+5 (schema reflete o que os testes já provaram necessário) | **Aplicada em produção em 2026-08-12 (§17.3), após validação completa no remoto via BEGIN...ROLLBACK (§17.2).** Roteiro de testes dividido em 4 scripts independentes (`supabase/tests/fase6_cenarios_teste_1_estrutura.sql` a `_4_integracao_rpc.sql`), todos executados com sucesso contra o banco remoto antes da aplicação real: UPDATE direto de `vigente` rejeitado tanto sem marca quanto tentando reativar com marca; UPDATE/DELETE rejeitado nas 3 tabelas filhas (itens/distribuições/dias); dia rejeitado quando a distribuição pai é `TERCEIRIZADO`; teste específico provando que a comparação de imutabilidade cobre uma coluna nova adicionada de propósito no teste, sem editar o trigger; `calendario_oficial_feriados` incrementa todas as empresas; FK composta rejeita vínculo cross-tenant; 19 triggers de versão confirmados nominalmente; testes de regressão de ponta a ponta chamando as RPCs reais `aprovar_projeto_com_simulacao_v5` **e** `v4` (rollback) após o schema instalado (snapshot novo vigente=true, antigo desativado, replay idêntico sem nenhuma escrita - contagens e `aprovado_em` confirmados -, replay conflitante rejeitado); resíduo zero confirmado após cada rollback. Pós-aplicação real: 3 tabelas + coluna `ajuste_cenario` + 19 triggers + backfill 1:1 (2/2) confirmados por leitura. Pendente: `migration repair`, commit, push, deploy (§17.3) |
| **7 — Cadastro do vínculo no Roteiro** | Seleção "Necessário antes de" na linha do subconjunto (`RoteiroForm.tsx`/`useRoteiro.ts`) — no máximo 1 operação por subconjunto, troca por `UPDATE` atômico, remoção lógica por `UPDATE` (dono ou admin, nunca `DELETE` físico), `ativo` sempre `true` (`CHECK`), trigger de imutabilidade de auditoria, índice único mais forte substituindo o da Fase 6, `mapearVinculosSubconjunto.ts` (contrato de leitura testado, decisões completas em §6.1) | Fase 6 | **Migration `202608120001` aplicada em produção em 2026-08-12 (§17.4, aplicação acidental via SQL Editor, auditada em 2 rodadas de leitura — schema aplicado bate exatamente com o arquivo, 0 linhas, sem resíduo). Tier A (`fase7_dependencia_subconjunto_teste.sql`, reescrito para testar o schema já aplicado, sem replicar DDL) executado com sucesso pelo usuário: os 10 cenários passaram — CHECK/trigger/índice/RLS/unicidade/auditoria cobertos, 0/0 linhas antes/depois.** Tier C (`mapearVinculosSubconjunto.test.ts`): tradução linha crua→motor testada isoladamente. **Não é critério desta fase** que o motor leia vínculos reais em produção — essa integração fim-a-fim é de uma fase futura ainda não desenhada (ver §6.1). **Validação E2E real concluída em 2026-08-12 (§17.5) — só o caminho de criação**: produto `6158-02`, subconjunto `02-6158-03-01`, criar vínculo com OP30 — soldar estrutura pela interface real, recarregar (F5), confirmar seleção mantida e 1 linha ativa no banco. Troca e remoção lógica **não foram exercitadas pela interface real** — continuam cobertas só pelos testes automatizados (Tier A SQL + `trocarVinculoSubconjunto.test.ts`). Correção dos 2 nomes de policy truncados (`202608120002`) aplicada e auditada (§17.4); `migration repair` das duas migrations concluído. **Pendente**: commit, push, deploy |
| **8 — Frontend: geração/comparação** | Sub-fases (decisão confirmada com o usuário): **8a** camada de orquestração (`avaliarCenario`/`carregarBaseCenarios`, sem UI - base congelada uma vez, N cálculos puros); **8b** tela builder single-projeto (hora extra, terceirização, recurso temporário) + grid de comparação; **8c** incremento multiprojeto (troca de prioridade + grid de impacto), obrigatório antes de encerrar a fase, não backlog futuro. **Contratações `por_dia_contratado` (§10) exibem dias contratados, utilização real e ociosidade lado a lado** — decisão registrada na Fase 4, não pode se perder aqui | Fase 0-7 (schema já existe) | Zero consulta de rede extra por cenário adicional; UI mostra as 4 datas + estado + custo + impacto; contratação `por_dia_contratado` mostra os 3 números; teste manual E2E read-only. **8a em andamento**: `coletarGrafoOcorrenciasBom.ts` fechado e validado com dado real (produto `6158-02`, §6.2) — ponte dado real→grafo pronta; `carregarBaseCenarios.ts`/`avaliarCenario.ts` (recorte hora extra) seguem em implementação |
| **9 — RPC v6 + aprovação** | `aprovar_projeto_com_simulacao_v6_cenario`, `ajuste_cenario` versionado (§12), recálculo autoritativo completo, versão consistente na aprovação, hash cobrindo o cenário inteiro (§13) | Fase 6+8 | Mesmo rigor do DEC-006: testes comportamentais (client simulado), payload completo, chamada única, replay idempotente e conflitante testados. **Teste de concorrência real (2 aprovações simultâneas disputando o mesmo recurso, uma vence e a outra é rejeitada com mensagem clara) pertence a esta fase — só a RPC real permite esse teste, não a migration isolada** |
| **10 — E2E real** | Fixture dedicado, aprovação real, leitura do snapshot completo | Fase 9 | Checkpoint humano antes de cada escrita real, verificação por leitura antes/depois, auditoria de diff antes de commit — mesmo protocolo já usado nesta sessão |

Fases 4 e 5 podem ser desenvolvidas em paralelo assim que a Fase 3 estiver concluída (ambas
consomem o motor completo, não dependem uma da outra).
