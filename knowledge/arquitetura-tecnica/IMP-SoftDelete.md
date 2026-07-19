# IMP — Implementação de Referência: Soft Delete

**Data:** 2026-07-19
**Status:** Vigente
**Natureza do documento:** implementação de referência — aponta para
arquivos, hooks e componentes reais do código. **Pode ficar
desatualizado com o tempo — isso é esperado e aceitável neste
documento** (ao contrário de `PAD-004_Politica_Exclusao_Registros.md`,
que é a arquitetura permanente e não deve citar nomes de arquivo).

---

## 1. RLS — exemplo real já corrigido

`calendario_empresa_eventos` (`supabase/migrations/202607180004_calendario_empresa_eventos.sql`)
é a implementação de referência do padrão descrito em PAD-004 seção 2.
A policy de `SELECT` e a cláusula `USING` de `UPDATE` contêm apenas
`empresa_id = public.empresa_atual_id()` — sem `deleted_at`.

## 2. Hook — filtro explícito na query

`src/modules/calendario/hooks/useCalendarioOperacional.ts`:

```ts
const { data } = await supabase
  .from("calendario_empresa_eventos")
  .select("id,empresa_id,data,tipo,descricao,ativo")
  .is("deleted_at", null)
  .order("data", { ascending: false });
```

E o soft-delete em si (mesmo arquivo):

```ts
await supabase
  .from("calendario_empresa_eventos")
  .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
  .eq("id", id);
```

## 3. DELETE físico admin-only + guarda por FK RESTRICT

`src/modules/shared/data/excluirRegistro.ts` — helper compartilhado
usado pelas tabelas que permitem DELETE físico
(`recursos_produtivos`, `grupos_recursos`, `funcionarios`, `bom_itens`,
`bom_operacoes`, `bom_servicos_terceiros`, `bom_transportes`). Faz
`.delete().eq("id", id).select("id")` e distingue dois bloqueios que a
RLS resolve sem lançar erro:

- FK `RESTRICT` (há vínculo real) → Postgres lança `23503`, capturado
  e traduzido para `{ status: "vinculado" }`.
- Policy de DELETE não satisfeita (usuário não é admin) → o DELETE
  roda sem erro, mas casa 0 linhas → `{ status: "sem_permissao" }`.

A migration `supabase/migrations/202607070003_delete_admin_funcionarios_recursos_grupos.sql`
documenta a decisão de liberar DELETE físico (restrito a admin) para
`funcionarios`/`recursos_produtivos`/`grupos_recursos`, com a FK
`RESTRICT` como guarda real contra exclusão de registros vinculados a
produção.

`src/modules/shared/components/ExclusaoBloqueadaBanner.tsx` — banner
compartilhado que exibe o resultado desses dois bloqueios, incluindo o
botão "Desativar em vez disso" (seta `ativo = false` — não é
restauração de soft-delete, ver PAD-004 seção 5).

## 4. Confirmação de exclusão — estado atual (ad-hoc)

Não existe componente reutilizável hoje. Toda confirmação usa
`window.confirm(...)` inline:

| Arquivo | Linha | Mensagem |
| --- | --- | --- |
| `src/app/recursos/[id]/page.tsx` | 33-35 | "Deseja excluir permanentemente este recurso? Essa ação não pode ser desfeita." |
| `src/app/colaboradores/[id]/page.tsx` | 62-64 | "Deseja excluir permanentemente este colaborador? Essa ação não pode ser desfeita." |
| `src/app/grupos-recursos/[id]/page.tsx` | 33-35 | "Deseja excluir permanentemente este grupo de recursos? Essa ação não pode ser desfeita." |
| `src/modules/colaboradores/components/ColaboradoresTable.tsx` | 41-43 | mesmo texto de colaborador (duplicado) |
| `src/modules/recursos/components/RecursosTable.tsx` | 41-43 | mesmo texto de recurso (duplicado) |
| `src/modules/grupos-recursos/components/GruposRecursosTable.tsx` | 44-46 | mesmo texto de grupo (duplicado) |
| `src/modules/roteiros/components/RoteiroForm.tsx` | 131, 138, 160, 167, 174 | "Remover {item} do roteiro?" — texto mais curto, sem o aviso de "não pode ser desfeita" |

O texto das três primeiras famílias (recurso/colaborador/grupo) é
idêntico e duplicado 2x cada — colado, não centralizado.

## 5. Proposta — `ConfirmarExclusaoModal`

Componente compartilhado ainda não implementado. Deveria seguir o
mesmo esqueleto já usado em
`src/modules/projetos/components/EditarQuantidadeItemModal.tsx` e
`src/modules/projetos/components/EditarCustoItemModal.tsx`:

- controlado por uma prop nullable (não por um booleano `isOpen`
  separado);
- overlay fixo (`fixed inset-0 z-50 flex items-center justify-center
  bg-slate-950/40`), painel com cabeçalho/corpo/rodapé com borda;
- estado local `salvando`/`erro`;
- callback assíncrono que retorna um resultado tipado — pode
  reaproveitar diretamente `ResultadoExclusao` de
  `src/modules/shared/data/excluirRegistro.ts`, e os estados
  `"vinculado"`/`"sem_permissao"` já cobertos por
  `ExclusaoBloqueadaBanner.tsx`;
- botão principal destrutivo (vermelho) em vez do azul usado nos
  modais de edição; sem campo de input, só a mensagem de confirmação.

Não implementado nesta etapa — documentado aqui como padrão a adotar
na próxima vez que uma tela de exclusão for criada ou revisada.
