# Auditoria Completa das Migrations — NEXOTFE

**Data:** 21/06/2026  
**Escopo:** 52 arquivos em `supabase/migrations`  
**Base factual:** backup restaurado e catálogo integral do schema `public`  
**Regra:** nenhuma migration foi executada

## 1. Conclusão executiva

O histórico atual **não pode ser utilizado como cadeia oficial de implantação da Arquitetura NEXOTFE 1.0**.

Ele preserva trabalho útil, mas mistura:

- objetos que dependem de uma fundação não versionada;
- estruturas que já existiam antes das migrations locais;
- mudanças evolutivas válidas;
- versões intermediárias substituídas;
- uma migration consolidada duplicada;
- scripts de validação no diretório executável;
- fluxos funcionais incompatíveis com a arquitetura congelada.

Portanto, a estratégia correta é preservar o histórico como evidência e construir um baseline canônico controlado. Não é seguro renomear, apagar ou reaplicar os 52 arquivos diretamente no banco atual.

## 2. Evidências utilizadas

- backup `nexotfe_public_20260621_000436.dump` com SHA-256 validado;
- restauração PostgreSQL concluída nas seções `pre-data`, `data` e `post-data`;
- 29 tabelas, 16 views, 23 funções, 106 policies, 117 FKs e 29 triggers catalogados;
- zero constraints inválidas;
- zero índices inválidos;
- inventário individual com hash dos 52 arquivos;
- comparação de tabelas, colunas, views, funções, policies e triggers;
- documentos normativos, em especial o Estudo Técnico 001 e Estados Oficiais.

Artefatos auxiliares:

- `AUDITORIA_MIGRATIONS/inventario_migrations.csv`;
- `AUDITORIA_MIGRATIONS/classificacao_migrations.csv`;
- `CATALOGO_BANCO_RESTAURADO/`.

## 3. Resultado quantitativo

| Objeto | Histórico local | Banco restaurado | Sem origem local |
|---|---:|---:|---:|
| Tabelas | 19 | 29 | 10 |
| Views | 8 | 16 | 8 |
| Funções | 9 | 23 | 14 |
| Policies | 65 únicas | 106 | 42 |
| Triggers | 14 únicos | 29 | 15 |

Uma policy local, `planejamento_compra_origens_update_blocked`, não existe mais no banco porque foi substituída pela migration 22. Todas as tabelas, views e funções locais possuem algum correspondente nominal no banco restaurado.

## 4. Fundação ausente do histórico

### Tabelas sem migration local

`clientes`, `credenciais`, `empresas`, `funcionarios`, `grupos_recursos`, `movimentacoes_estoque`, `profiles`, `recursos_produtivos`, `tecnologias_aplicadas` e `usuarios`.

### Funções fundamentais sem migration local

`empresa_atual_id`, `set_updated_at`, `set_atualizado_em`, `usuario_e_admin`, `usuario_empresa_atual`, `set_empresa_id_from_usuario`, `validar_movimentacao_estoque`, `handle_new_auth_user`, `preparar_empresa_saas`, `proximo_codigo_empresa`, `gerar_slug_empresa_unico`, `normalizar_slug_empresa`, `soft_delete_operacional` e `restore_operacional`.

Consequência: um banco vazio não consegue executar a primeira migration sem receber previamente objetos externos ao repositório.

## 5. Bloqueios de replay

### Ordem inválida

`202606030002_projetos_02_tabela_itens.sql` referencia `itens_industriais`, criada apenas na migration 32.

### Migration consolidada duplicada

`202606050036_all_migrations_consolidated.sql` repete tabelas, constraints, triggers, policies, funções e views das migrations 32 a 35. Parte dos comandos não possui `IF NOT EXISTS` ou remoção prévia.

### Histórico não idempotente

Triggers e policies são majoritariamente criados com `CREATE` simples. Reaplicar o histórico sobre um banco parcialmente existente provoca colisões.

### Script que não é migration

`202606050037_validation_check.sql` é um diagnóstico e deve ficar fora do caminho executável de migrations.

## 6. Drift estrutural comprovado

### `projetos`

A migration declara `margem_lucro_percent`, ausente no banco restaurado. Os estados também divergem:

- migration: `em_elaboracao`, `em_analise`, `aprovado`, `perdido`, `cancelado`;
- banco: `orcamento`, `aprovado`, `producao`, `finalizado`, `cancelado`;
- Estados Oficiais: `rascunho`, `em_orcamento`, `em_desenvolvimento`, `aguardando_aprovacao`, `aprovado`, `em_planejamento`, `em_producao`, `concluido`, `cancelado`.

Nem o banco nem a migration representam a norma congelada.

### `itens_industriais`

A migration e o banco representam modelos diferentes. A migration usa `pn`, `tipo`, `revisao`, `categoria`, `peso_unitario` e `codigo_cliente`; o banco usa, entre outros, `codigo`, `tipo_item`, `familia`, `classificacao`, campos fiscais e referências documentais. O uso de `CREATE TABLE IF NOT EXISTS` ocultou o conflito.

### Estoque duplicado

Existem `estoque_movimentacoes` e `movimentacoes_estoque`, com semânticas e conjuntos de estados diferentes. A primeira inclui `reserva` e `liberacao_reserva` como movimentos físicos, contrariando o Estudo Técnico 001, que determina reserva lógica separada do consumo físico.

## 7. Incompatibilidades com Estados Oficiais

As constraints atuais de `projetos`, `ordens_fabricacao`, `requisicoes_compra` e `pedidos_compra` não correspondem aos ciclos oficiais.

Exemplos:

- OF atual: `planejada`, `em_producao`, `concluida`, `suspensa`, `cancelada`;
- OF oficial: `simulacao`, `aguardando_material`, `pronta_programacao`, `programada`, `em_producao`, `parada`, `finalizada`, `cancelada`;
- requisição atual: `aberta`, `em_compra`, `atendida`, `cancelada`;
- requisição oficial: `aberta`, `em_cotacao`, `aprovada`, `convertida_pedido`, `cancelada`;
- pedido atual: `rascunho`, `enviado`, `confirmado`, `cancelado`;
- pedido oficial: `emitido`, `parcialmente_recebido`, `recebido`, `encerrado`, `cancelado`.

Essas migrations precisam de substituição planejada, não de simples reaplicação.

## 8. Incompatibilidades com o Estudo Técnico 001

### Decisão automática

`processar_necessidade_material` decide automaticamente entre estoque e compra e já executa efeitos. O contrato normativo exige necessidade persistida e decisão humana do PCP.

### Criação de OF com efeitos indevidos

`criar_ordem_fabricacao_operacional` cria a OF, percorre a BOM, baixa estoque e gera requisições automaticamente. O Estudo Técnico 001 determina expressamente que criar uma OF não pode reservar material nem gerar compra automaticamente.

### Reserva confundida com consumo

`registrar_consumo_interno` reduz saldo disponível durante a decisão. Não existem `necessidades_materiais`, `decisoes_pcp_materiais`, `reservas_estoque` ou `reserva_estoque_eventos`.

### Falta de snapshot de roteiro

`ordens_fabricacao` não fixa roteiro, versão de roteiro ou valores usados para gerar necessidades.

Resultado: migrations 13, 14, 16, 17, 19, 46, 47 e 48 exigem substituição funcional coordenada.

## 9. Segurança e multiempresa

### RLS ausente

`boms` e `bom_itens` são as únicas tabelas restauradas sem RLS habilitado. Isso é crítico porque ambas contêm `empresa_id` ou são alcançáveis por relações industriais multiempresa.

### Views

As oito views provenientes das migrations locais não declaram `security_invoker=true`. As oito views preexistentes ao histórico declaram essa opção corretamente.

### Policies

Há 42 policies sem origem local. Isso confirma que a segurança efetiva do banco não pode ser reconstruída pelas migrations atuais.

### Funções privilegiadas

O banco possui nove funções `SECURITY DEFINER`, todas externas ao histórico local e configuradas com `search_path=public`. Elas devem integrar o baseline e receber testes explícitos de autorização.

### Grants

O backup foi gerado com `--no-privileges`. A tentativa de consulta remota foi bloqueada pela política de rede antes de alcançar o Supabase. Assim, a migration 52 permanece sem validação factual de aplicação.

## 10. Assinaturas e versões substituídas

O histórico define versões sem `p_of_id` de:

- `registrar_consumo_interno`;
- `registrar_requisicao_compra_material`.

Depois cria versões com `p_of_id`. O banco restaurado contém somente as assinaturas finais. Um replay literal pode criar overloads antigos que não existem no banco atual.

Também existem três versões de `vw_planejamento_compras_operacional`; somente a migration 26 representa a definição final restaurada.

## 11. Classificação consolidada

### Retirar do caminho executável definitivo

- migration consolidada 36;
- script de validação 37;
- versões intermediárias substituídas de funções e views;
- comentários ligados exclusivamente a assinaturas substituídas.

Não apagar: preservar como evidência histórica fora do novo replay.

### Reaproveitar como lógica, incorporando ao baseline

- índices idempotentes;
- estrutura de matérias-primas, configurações, planejamento e fornecedores após revisão;
- lógica de numeração após adequação transacional;
- comentários ainda coerentes.

### Substituir antes da implementação definitiva

- Projeto e seus Estados;
- Itens Industriais;
- OF;
- Requisição e Pedido de Compra;
- decisão automática de material;
- consumo antecipado;
- views operacionais sem `security_invoker`;
- RLS ausente de BOM;
- modelo de reserva embutido em movimento físico.

A decisão individual de cada arquivo está em `AUDITORIA_MIGRATIONS/classificacao_migrations.csv`.

## 12. Estratégia de saneamento recomendada

1. Congelar os 52 arquivos como histórico imutável.
2. Obter o ledger remoto e uma exportação específica de grants quando a rede permitir.
3. Criar baseline canônico a partir do catálogo restaurado, incluindo a fundação ausente.
4. Corrigir no baseline somente divergências já determinadas pela Arquitetura 1.0, com plano de dados separado.
5. Retirar a consolidada e o validation check do caminho executável sem apagar evidência.
6. Criar migrations evolutivas novas para Estados Oficiais, RLS de BOM e eixo do Estudo Técnico 001.
7. Ensaiar o baseline em banco vazio.
8. Ensaiar a evolução sobre uma nova restauração representativa.
9. Comparar catálogo, contagens, policies, grants e assinaturas.
10. Somente depois autorizar aplicação em ambiente não descartável.

## 13. Decisão arquitetural

**Auditoria estática dos 52 arquivos: concluída.**  
**Histórico atual apto para replay: não.**  
**Trabalho existente aproveitável: sim, de forma seletiva.**  
**Aplicação de migrations autorizada: não.**

Pendência externa para fechar a reconciliação operacional: ledger `supabase_migrations` e grants remotos, não acessíveis nesta sessão por bloqueio de rede.
