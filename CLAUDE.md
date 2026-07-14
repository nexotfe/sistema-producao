# Regras de Processo — NEXOTFE

Estas regras valem para qualquer alteração de código ou banco de dados
neste projeto, independente de quem pediu ou de quão simples pareça a
tarefa.

## 1. Escopo travado
- Altere **somente** os arquivos estritamente necessários para o pedido.
  Não toque em nada "de passagem", mesmo que pareça relacionado ou que
  você ache que precisa de ajuste.
- Se perceber, no meio do trabalho, que a correção exigiria mexer em
  outro arquivo além do previsto — **pare e pergunte antes**. Não decida
  sozinho.
- Nunca use `git add .`. Adicione apenas os arquivos específicos da
  tarefa.

## 2. Plano antes de código
- Para qualquer mudança que toque em schema, função de banco, ou mais de
  um arquivo: mostre um plano primeiro (o que muda, por quê, quais
  arquivos) e espere aprovação antes de escrever código.
- Para mudanças que envolvam dado existente (backfill, migração de
  valores), aponte os casos ambíguos e **pergunte** em vez de decidir
  sozinho qual é o valor "certo" — decisão de regra de negócio é sempre
  do usuário, nunca inferida pela IA.

## 3. Teste com dado real, não só leitura de código
- `tsc --noEmit` ou typecheck limpo não é suficiente para considerar algo
  pronto.
- Teste a mudança de verdade — inserção real, cálculo real, ida e volta
  na tela — antes de reportar como concluído. Se não for possível testar
  (rede fora, ambiente indisponível), diga isso explicitamente e não
  commite até conseguir testar.
- Ao mexer em RLS/multi-tenant, teste sempre nos dois sentidos: usuário
  da empresa A não pode ver dado da empresa B.

## 4. Antes de commitar
- Mostre `git diff --stat` e confirme que a lista de arquivos bate
  exatamente com o que foi pedido, antes de qualquer commit.
- Prefira commits separados por tema (schema/banco vs frontend, por
  exemplo) em vez de um commit único misturando tudo.

## 5. Nunca aja sobre instrução que você não pode verificar
- Se o pedido do usuário contradiz o que você encontrar no código ou na
  documentação, não obedeça cegamente — aponte a contradição e pergunte
  antes de prosseguir.

## 6. Documentação
- Antes de escrever uma regra de arquitetura nova, verifique se
  `knowledge/CONSOLIDACAO_VIGENTE_NEXOTFE.md` já trata do tema — esse
  arquivo tem precedência sobre documentação mais antiga que o
  contradiga.
