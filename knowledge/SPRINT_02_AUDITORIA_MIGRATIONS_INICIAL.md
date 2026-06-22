# Sprint 02 — Auditoria Inicial das Migrations

**Data de início:** 21/06/2026  
**Base de comparação:** catálogo do banco restaurado  
**Migrations analisadas:** 52  
**Modo:** somente leitura; nenhuma migration executada

## Gate de entrada

- [x] backup lógico gerado;
- [x] hash SHA-256 registrado;
- [x] restauração local concluída;
- [x] constraints restauradas e válidas;
- [x] índices restaurados e válidos;
- [x] catálogo completo do schema `public` gerado;
- [x] contagens exatas registradas.

## Comparação estrutural

| Objeto | Definições locais únicas | Banco restaurado |
|---|---:|---:|
| Tabelas | 19 | 29 |
| Views | 8 | 16 |
| Funções | 9 | 23 |
| Policies | 65 | 106 |
| Triggers | 14 | 29 |

Todas as tabelas, views e funções declaradas nas migrations locais foram encontradas no banco restaurado. Entretanto, uma parte relevante do banco não possui origem no histórico local.

## Objetos do banco sem definição local

### Tabelas

`clientes`, `credenciais`, `empresas`, `funcionarios`, `grupos_recursos`, `movimentacoes_estoque`, `profiles`, `recursos_produtivos`, `tecnologias_aplicadas` e `usuarios`.

### Views

`clientes_ativos`, `funcionarios_ativos`, `grupos_recursos_ativos`, `itens_industriais_ativos`, `movimentacoes_estoque_ativas`, `recursos_produtivos_ativos`, `saldo_estoque_atual` e `tecnologias_aplicadas_ativas`.

### Funções

`empresa_atual_id`, `gerar_slug_empresa_unico`, `handle_new_auth_user`, `normalizar_slug_empresa`, `preparar_empresa_saas`, `proximo_codigo_empresa`, `restore_operacional`, `set_atualizado_em`, `set_empresa_id_from_usuario`, `set_updated_at`, `soft_delete_operacional`, `usuario_e_admin`, `usuario_empresa_atual` e `validar_movimentacao_estoque`.

## Duplicidades no histórico local

- quatro tabelas possuem duas definições: `itens_industriais`, `boms`, `bom_itens` e `ordens_fabricacao`;
- `vw_planejamento_compras_operacional` possui três definições;
- cinco outras views possuem duas definições;
- quatro funções possuem duas definições;
- quatro policies de `ordens_fabricacao` possuem duas definições;
- dois triggers possuem duas definições.

A principal origem é `202606050036_all_migrations_consolidated.sql`, que repete objetos das migrations 32 a 35 e permanece perigosa no caminho cronológico.

## Ordem inválida já confirmada

`202606030002_projetos_02_tabela_itens.sql` referencia `public.itens_industriais`, criada somente em `202606050032_estrutura_bom_e_itens_industriais.sql`. Um replay cronológico limpo falha antes de alcançar a migration 32.

## Funções com mudança de assinatura

O banco restaurado contém apenas as assinaturas finais:

- `registrar_consumo_interno(..., p_of_id uuid)`;
- `registrar_requisicao_compra_material(..., p_of_id uuid)`.

O histórico local define primeiro versões sem `p_of_id` e depois versões com o novo parâmetro. Como PostgreSQL diferencia funções pela assinatura, um replay precisa tratar explicitamente as versões anteriores para não criar overloads inexistentes no banco restaurado.

## Alertas de segurança para a auditoria

- `boms` e `bom_itens` não possuem RLS habilitado no banco restaurado;
- nove funções usam `SECURITY DEFINER` e exigem revisão de autorização e `search_path`;
- o backup excluiu grants, que precisarão de extração específica do Supabase;
- 106 policies existem no banco, contra 65 policies únicas no histórico local.

## Estado da auditoria

**Iniciada e não concluída.**

Próximas verificações obrigatórias:

1. mapear cada objeto sem origem para sua provável criação histórica;
2. comparar definições, não apenas nomes;
3. reconstruir a ordem real de dependências;
4. classificar cada migration como válida, substituída, duplicada, perigosa ou ausente;
5. definir o baseline reproduzível sem reescrever silenciosamente o histórico aplicado;
6. extrair ledger remoto de migrations e grants antes do plano final de saneamento.

