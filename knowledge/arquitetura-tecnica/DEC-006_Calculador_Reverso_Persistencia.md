# DEC-006 — Decisão de Negócio: Ativação do Calculador Reverso na Persistência

**Data:** 2026-08-10
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada, mesmo gênero de `DEC-001` a
`DEC-005`. Fecha a reconciliação de escopo que `PAD-008_Motor_Capacidade.md` §22 registrava
como pendente entre sua seção 18 (Calculador Reverso) e `ARQUITETURA_VIGENTE_SIMULACAO_COMERCIAL_CAPACIDADE.md`
§17.

**Contexto:** a RPC `aprovar_projeto_com_simulacao_v5_estimativa_inicio` já estava aplicada no
banco (`supabase/migrations/202608030001_...sql`) e o núcleo TypeScript do Calculador Reverso
(`estimarInicioNecessario.ts`, `prepararCalculadorReverso.ts`) já rodava no cliente (preview),
mas nada na persistência autoritativa os usava — o servidor seguia preso à v4, sem recalcular o
Calculador Reverso, sem enviar nem persistir seus campos. Esta decisão fecha essa ativação.

---

## 1. Reconciliação arquitetural

**O Calculador Reverso é uma estimativa comercial congelada no snapshot da Simulação.** Não é
programação de PCP, não altera o Motor de Capacidade (`calcular_comprometido_v2`, distribuições)
e não determina causalidade sobre a produção real. É um dado informativo de viabilidade comercial,
gravado junto com o snapshot no momento da aprovação — não um insumo de planejamento.

## 2. Estados técnicos — sempre impeditivos

`dados_insuficientes` e `horizonte_tecnico_excedido` já eram impeditivos no preview do cliente
(bloqueiam o botão "Aprovar"). **Continuam impeditivos após o recálculo autoritativo no
servidor, sem exceção.** Se o recálculo autoritativo resultar em qualquer um desses dois
estados:

- A aprovação é **rejeitada** com erro explícito.
- **Nenhum campo de estimativa é persistido como `NULL`** para contornar a constraint.
- **Não há fallback silencioso para o comportamento v4** (que simplesmente não tinha o
  conceito). Se o cálculo autoritativo não consegue determinar uma estimativa confiável, a
  aprovação não acontece — não é registrada uma aprovação "sem estimativa" por baixo do pano.

`janela_insuficiente` é diferente: pode ser aprovada, mas **somente pelo fluxo de confirmação
de risco já existente** no projeto (o mesmo usado hoje para outras divergências de viabilidade).
Os dois estados técnicos acima **nunca** podem ser aprovados por esse fluxo de confirmação de
risco — a confirmação de risco cobre incerteza de negócio, não insuficiência de dado técnico.

**A confirmação não é um controle client-side.** A interface deriva o sinal do estado do preview
e reaproveita o modal de risco já existente (mesmo padrão de `DEC-002`), mas o servidor **exige e
verifica o mesmo sinal explícito de confirmação antes de persistir**, sobre o resultado do seu
próprio recálculo autoritativo — não sobre o que o cliente calculou. Uma chamada de aprovação sem
esse sinal, quando o recálculo autoritativo resulta em `janela_insuficiente`, é bloqueada pelo
orquestrador antes de qualquer cálculo de hash ou chamada à RPC (motivo `confirmacao_necessaria`).
O cliente pode ser adulterado; o bloqueio real está no servidor.

## 3. Rollout — direto para v5, sem fallback automático

O fluxo ativo passa a chamar **somente** `aprovar_projeto_com_simulacao_v5_estimativa_inicio`.
A função v4 permanece no banco, intacta, só para histórico/rollback técnico manual (uma ação
humana deliberada, não um caminho de código). **Falha na chamada da v5 aparece como erro para o
usuário — nunca persiste silenciosamente pela v4.** Não existe lógica de "se v5 falhar, tenta
v4" em nenhuma camada.

## 4. Hash de idempotência

O hash de idempotência (`calcularHashSolicitacao`) passa a ser calculado **depois** do
recálculo autoritativo, incluindo os 4 campos novos (`estimativa_inicio_necessario`,
`estimativa_estado`, `estimativa_metodo_versao`, `folga_dias_produtivos`) na composição
canônica. Calcular o hash antes do recálculo (sobre um payload que ainda não reflete a
estimativa real) reabriria a mesma classe de risco de colisão silenciosa via
`ON CONFLICT DO NOTHING` identificada na investigação prévia.

**Nenhum campo de estimativa vindo do cliente é confiável** — mesmo que o cliente envie esses 4
campos no payload (hoje não envia), o servidor ignora e recalcula do zero, exatamente como já
acontece com janela e Motor.

## 5. Snapshot antigo na interface

Snapshots persistidos antes desta ativação (os 4 campos `NULL`, ramo legado da constraint)
exibem **"Estimativa não registrada nesta simulação"** — mensagem neutra, sem referência
interna a nomes de entrega/sprint. Não reutilizar o texto `"— (simulação anterior à Entrega 1)"`
usado para outros campos legados.

## 6. Testes exigidos (além dos já existentes)

- Replay de idempotência: mesma chave/hash retorna o snapshot já persistido (não duplica, não
  recalcula de novo).
- Mesma chave com estimativa diferente (hash diferente por causa dos 4 campos novos) é rejeitada
  como solicitação distinta, não confundida com a original.
- Bloqueio dos dois estados técnicos no recálculo autoritativo, mesmo que o cliente tenha
  enviado (ou não) um resultado de preview diferente.
- `janela_insuficiente` só passa pelo fluxo de confirmação de risco; os dois estados técnicos
  não passam por ele mesmo com confirmação de risco presente no payload.
- Sem o sinal de confirmação, `janela_insuficiente` bloqueia (`confirmacao_necessaria`) e
  `persistir` recebe zero chamadas; com o sinal, o fluxo prossegue e persiste.
- `baseFixa`/contexto de calendário são preparados uma única vez por aprovação, compartilhados
  entre o Motor e o Calculador Reverso (nunca duas preparações independentes na mesma chamada).

Testes direcionados a cada fase durante a implementação; suíte do módulo e suíte completa
rodam só no fechamento de cada fase (economia de créditos), não a cada passo intermediário.

**Escopo real dos testes atuais (Fase 1):** os testes acima cobrem o orquestrador com
dependências injetadas/mockadas — provam estabilidade e sensibilidade do hash, preparação única
da base, e a lógica de bloqueio/confirmação. Não são testes de replay contra a RPC real. O
replay de idempotência descrito no primeiro item desta lista (mesma chave/hash retorna snapshot
já persistido; mesma chave com hash diferente é rejeitada) só pode ser validado de fato contra
`aprovar_projeto_com_simulacao_v5_estimativa_inicio` depois da ativação da v5 na Fase 2 — fica
registrado como pendência dessa fase, não desta.
