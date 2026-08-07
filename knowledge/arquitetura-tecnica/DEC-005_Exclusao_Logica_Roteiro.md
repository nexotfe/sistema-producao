# DEC-005 — Decisão de Negócio: Exclusão Lógica de Roteiro (BOM)

**Data:** 2026-08-06
**Versão:** 1.0
**Status:** Vigente
**Natureza do documento:** decisão de negócio formalizada — registra a
regra de exclusão de uma entidade específica (o Roteiro/BOM), no mesmo
gênero de `DEC-001` a `DEC-004`. Especializa, para o Roteiro, a política
geral de exclusão já registrada em `PAD-004_Politica_Exclusao_Registros.md`
— não a substitui, só detalha as regras próprias desta entidade que o
padrão geral não cobre (dependência de subconjunto, dependência de
orçamento, versão substituta, locks de concorrência).

**Implementado em:** migration
`supabase/migrations/202608060002_excluir_bom_logico.sql` (2026-08-06).
Este documento é o registro de decisão de negócio; a migration é a fonte
técnica autoritativa — em caso de divergência futura entre os dois,
prevalece a migration (ver regra de fallback em `CLAUDE.md`/`AGENTS.md`).

---

## Contexto

O botão "Excluir roteiro" em `/roteiros/[pn]` existia só visualmente,
sem ação nenhuma ligada a ele. Esta decisão liga a função real por trás
do botão.

## Regra de negócio

**Exclusão é lógica, nunca física.** `excluir_bom(p_bom_id)` só executa
`UPDATE boms SET deleted_at = now(), deleted_by = auth.uid()`. `DELETE`
físico do cabeçalho do Roteiro é sempre rejeitado, mesmo para
administrador — apagar fisicamente destruiria em cascata materiais,
operações, serviços de terceiros, transportes e o histórico.

**Alvo é o BOM carregado**, a versão atual da tela — não o Produto
inteiro. Um Produto pode ter várias versões de Roteiro.

**Só administrador.** A checagem (`usuario_e_admin() IS NOT TRUE` →
exceção) é feita dentro da função, porque a policy de `UPDATE` de `boms`
hoje é mais ampla (`created_by OR admin`) do que a regra de negócio
exige — a função não confia só na RLS.

## Bloqueios de dependência

A exclusão é bloqueada em dois casos, e permitida em ambos **se existir
outra versão de Roteiro que ainda resolva o Produto** (reaproveita
`resolver_bom_ativo_produto`, sem redefinir "BOM resolvido" em paralelo):

1. **Subconjunto vivo.** Se outro Produto depende deste Roteiro como
   subconjunto (estrutura multinível) e, sem ele, esse outro Produto
   fica sem nenhum BOM resolvível, o trigger já existente
   `trg_boms_validar_ciclo` aborta a transação inteira — nenhuma lógica
   nova foi criada para este caso.
2. **Dependência de orçamento.** Se, após a exclusão, o Produto ficar
   sem nenhum BOM resolvível **e** houver `projeto_itens` ativo
   (`ativo = true`, não excluído) de um projeto não excluído usando esse
   Produto, a exclusão é rejeitada. A mensagem identifica o projeto por
   `projetos.numero_projeto` — nunca por `projeto_itens.pn` (coluna
   legada, não é mais o identificador funcional; ver item 6 de
   `../CONSOLIDACAO_VIGENTE_NEXOTFE.md`).

## Locks de concorrência

Duas camadas, para que exclusão e inserção de item de orçamento nunca
vejam estado inconsistente uma da outra, mesmo vindas de
conexões/transações PostgREST diferentes:

- **Lock de linha do Produto**: `SELECT ... FOR UPDATE` em
  `itens_industriais`. Um trigger novo em `projeto_itens`
  (`trg_projeto_itens_lock_produto`) adquire o mesmo lock antes de
  `INSERT`/`UPDATE` de `produto_id` — não é uma regra de negócio nova,
  só coordenação: adicionar item ao orçamento antes do Roteiro existir
  continua funcionando normalmente.
- **Advisory lock do grafo** (`subconjunto-grafo:<empresa_id>`), a mesma
  chave já usada pelos gatilhos de proteção de ciclo de `boms`/`bom_itens`
  — serializa contra qualquer mutação concorrente de estrutura de
  subconjuntos.
- **Revalidação pós-lock** embutida no próprio
  `UPDATE ... WHERE deleted_at IS NULL ... RETURNING`: se outra transação
  já excluiu o mesmo BOM nesse intervalo, `RETURNING` vem vazio e a
  função rejeita com mensagem de negócio, nunca reporta sucesso falso.

## Imutabilidade após exclusão

- **Cabeçalho (`boms`)**: trigger `BEFORE UPDATE OR DELETE`. `DELETE`
  físico é sempre rejeitado. `UPDATE` é rejeitado sempre que
  `OLD.deleted_at IS NOT NULL` — inclusive tentativa de "restaurar" via
  `UPDATE` comum (restauração exigirá RPC própria, fora deste escopo).
- **`UPDATE` direto não contorna `excluir_bom`.** A função grava uma
  marca transacional (`set_config('nexotfe.excluir_bom_id', p_bom_id::text, true)`,
  `is_local = true`, nunca escapa da transação) com o id exato do BOM
  sendo excluído. O trigger do cabeçalho, ao detectar a transição
  `null → timestamp`, exige simultaneamente: a marca bater com o id,
  `usuario_e_admin() IS TRUE`, e `NEW.deleted_by = auth.uid()`. Qualquer
  `UPDATE` fora de `excluir_bom` — mesmo de admin com `UPDATE` liberado
  pela RLS — nunca tem a marca certa e é rejeitado. Alterar `deleted_by`
  isoladamente também é rejeitado.
- **Linhas filhas** (`bom_itens`, `bom_operacoes`,
  `bom_servicos_terceiros`, `bom_transportes`): uma única função de
  trigger, reaproveitada nas 4 tabelas, bloqueia `INSERT`/`UPDATE`/`DELETE`
  referenciando um `bom_id` já excluído — inclusive mover uma linha para
  dentro ou para fora de um Roteiro excluído.

## Segurança

`excluir_bom` é `SECURITY INVOKER`, `search_path` fixo, sem parâmetro
livre de `empresa_id` (usa só `empresa_atual_id()`). `EXECUTE` revogado
de `public`/`anon`, concedido só a `authenticated`. Todas as funções de
trigger têm `search_path` fixo e `EXECUTE` revogado de
`public`/`anon`/`authenticated` (só disparam via gatilho). Nenhum
`DELETE` físico, nenhuma cascata.
