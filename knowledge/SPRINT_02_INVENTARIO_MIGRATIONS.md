# SPRINT 02 — INVENTÁRIO DAS MIGRATIONS E OBJETOS

**Data da verificação:** 20/06/2026  
**Modo:** somente leitura  
**Escopo:** `supabase/migrations` e objetos públicos expostos pelo Supabase

## Resultado executivo

O banco remoto está operacional, mas o histórico local de migrations não constitui uma origem reproduzível do esquema. A execução definitiva de novas migrations permanece bloqueada até a criação de um baseline íntegro, ordenado e testável.

## Inventário local

| Item | Definições encontradas | Objetos únicos |
|---|---:|---:|
| Arquivos de migration | 52 | 52 |
| Tabelas | 23 | 19 |
| Views | 15 | 8 |
| Funções | 13 | 9 |
| Triggers | 16 | 14 |
| Políticas RLS | 69 | 65 |

### Tabelas com definição local

`projetos`, `projeto_itens`, `numeracao_configuracoes`, `producao_configuracoes`, `materias_primas`, `estoque_saldos`, `estoque_movimentacoes`, `requisicoes_compra`, `requisicao_compra_itens`, `consumos_internos`, `planejamentos_compra`, `planejamento_compra_origens`, `pedidos_compra`, `pedido_compra_itens`, `itens_industriais`, `boms`, `bom_itens`, `ordens_fabricacao` e `fornecedores`.

### Funções com definição local

`registrar_consumo_interno`, `registrar_requisicao_compra_material`, `processar_necessidade_material`, `atualizar_planejamento_compra_decisao`, `definir_planejamento_compra_origem`, `gerar_pedido_compra_rascunho`, `gerar_numero_entidade`, `set_ordem_fabricacao_numero` e `criar_ordem_fabricacao_operacional`.

### Views com definição local

`vw_decisao_material_of`, `vw_planejamento_compras_operacional`, `vw_demanda_bom_of`, `vw_demanda_estoque`, `vw_demanda_consumo_compra`, `vw_of_fluxo_industrial`, `vw_of_consumo_detalhado` e `vw_of_fluxo_operacional`.

## Dependências ausentes do histórico local

As 52 migrations dependem de objetos que não são criados por elas:

- tabelas `empresas`, `usuarios` e `clientes`;
- tabela `recursos_produtivos`, presente no remoto e sem migration local identificada;
- função `public.empresa_atual_id()`;
- função `public.set_updated_at()`;
- infraestrutura do schema `auth`, fornecida pelo Supabase.

Consequência: uma implantação limpa baseada somente no repositório falha antes de reconstruir o banco atual.

## Dependência fora de ordem

`202606030002_projetos_02_tabela_itens.sql` cria uma chave estrangeira para `public.itens_industriais`, mas essa tabela é criada apenas em `202606050032_estrutura_bom_e_itens_industriais.sql`.

Consequência: o replay cronológico em banco vazio falha na segunda migration.

## Duplicidades perigosas

`202606050036_all_migrations_consolidated.sql` repete conteúdo das migrations 32 a 35, incluindo tabelas, constraints, triggers, políticas, funções e views. Nem todos esses comandos são idempotentes.

Também foram encontradas versões sucessivas legítimas de views e funções, porém duas funções mudaram de assinatura:

- `registrar_consumo_interno`: inclusão posterior de `p_of_id`;
- `registrar_requisicao_compra_material`: inclusão posterior de `p_of_id`.

Como `CREATE OR REPLACE FUNCTION` não substitui outra assinatura, o banco pode conservar overloads antigos e produzir chamadas ambíguas.

## Comparação com o Supabase remoto

### Confirmados no remoto

As 19 tabelas definidas localmente estão expostas no remoto. Também foram confirmadas `empresas`, `usuarios`, `clientes` e `recursos_produtivos`, apesar de não possuírem origem completa no histórico local. As oito views locais também foram confirmadas.

### Não confirmados no remoto

`tecnologias`, `grupos_tecnologias`, `colaboradores`, `roteiros_fabricacao`, `roteiro_operacoes`, `recebimentos`, `notas_fiscais_recebidas`, `reservas_estoque`, `expedicoes`, `entregas` e `operacoes_fabricacao` retornaram ausência na API pública.

Essas ausências pertencem às fases futuras da Arquitetura 1.0 e não representam, isoladamente, drift indevido nesta Sprint.

## Limitações da verificação

- A chave pública permite verificar exposição e existência, mas não inspecionar integralmente catálogo, constraints, grants, RLS, corpos de funções ou histórico remoto de migrations.
- `git`, Supabase CLI, Docker e `psql` não estão disponíveis no ambiente atual.
- Backup e restauração ainda não foram executados nem comprovados.

