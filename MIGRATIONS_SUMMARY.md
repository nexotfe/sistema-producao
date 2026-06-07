# 📊 Sumário de Migrations - Sistema de Produção NEXOTFE

## 🎯 Objetivo

Modelagem completa de Ordens de Fabricação (OF), BOM e fluxo operacional de estoque/consumo/compras no Supabase.

---

## 📁 Arquivos de Migration Criados

### 1️⃣ Migration 32: Estrutura BOM e Itens Industriais
**Arquivo:** `supabase/migrations/202606050032_estrutura_bom_e_itens_industriais.sql`

**Tabelas criadas:**
- `public.itens_industriais` - Catálogo de PNs
- `public.boms` - Estrutura BOM
- `public.bom_itens` - Componentes de BOM

**Índices:**
- `bom_itens_bom_id_idx`
- `bom_itens_materia_prima_id_idx`
- `bom_itens_componente_produto_id_idx`

---

### 2️⃣ Migration 33: Ordens de Fabricação e Integração
**Arquivo:** `supabase/migrations/202606050033_ordens_fabricacao_e_integracao.sql`

**Tabelas criadas:**
- `public.ordens_fabricacao` - Tabela principal de OF

**Colunas adicionadas:**
- `projeto_itens.bom_id`
- `consumos_internos.of_id`
- `estoque_movimentacoes.of_id`
- `requisicoes_compra.of_id`
- `planejamento_compra_origens.of_id`
- `pedidos_compra.of_id`
- `pedido_compra_itens.of_id`

**Índices:** 10 indices de performance

**RLS Policies:** 4 políticas (select, insert, update, delete_blocked)

**Trigger:** `set_ordens_fabricacao_updated_at`

**View:**
- `vw_of_fluxo_industrial` - Resumo de OF com contadores

---

### 3️⃣ Migration 34: Numeração de OF e Views Operacionais
**Arquivo:** `supabase/migrations/202606050034_of_numeracao_views.sql`

**Funções criadas:**
- `public.gerar_numero_entidade(text)` - Gera sequência de números
- `public.set_ordem_fabricacao_numero()` - Trigger para auto-numeração

**Trigger:**
- `set_ordem_fabricacao_numero` - Atribui número de OF automaticamente

**Views criadas:**
1. `vw_demanda_bom_of` - Demanda por componente de BOM
2. `vw_demanda_estoque` - Cobertura de estoque
3. `vw_demanda_consumo_compra` - Necessidade de compra externa

---

### 4️⃣ Migration 35: Operações de OF e Views Detalhadas
**Arquivo:** `supabase/migrations/202606050035_of_criacao_consumo_views.sql`

**Funções atualizadas:**
- `public.registrar_consumo_interno(...)` - Adicionado parâmetro `of_id`
- `public.registrar_requisicao_compra_material(...)` - Adicionado parâmetro `of_id`

**Funções novas:**
- `public.criar_ordem_fabricacao_operacional(...)` - Cria OF com automação de consumo/compra

**Views criadas:**
1. `vw_of_consumo_detalhado` - Detalhe de consumo por OF
2. `vw_of_fluxo_operacional` - Fluxo agregado por OF

---

### 5️⃣ Migration 36: Consolidado para Execução Rápida
**Arquivo:** `supabase/migrations/202606050036_all_migrations_consolidated.sql`

**Propósito:** Um único arquivo SQL com todas as migrations (32-35) para executar de uma vez no Supabase Dashboard.

---

## 🔄 Fluxo de Dados (BOM → Estoque → Consumo → Compra)

```
┌─────────────────────────────────────────────────────────────┐
│                    Ordem de Fabricação (OF)                 │
│                  criar_ordem_fabricacao_operacional()       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              BOM + Quantidade Planejada                      │
│         Calcula: quantidade_demanda = qtd * bom_qty         │
└─────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────┴──────────┐
                    ↓                     ↓
        ┌──────────────────┐    ┌──────────────────┐
        │   Estoque Livre  │    │   Falta Estoque  │
        │   Saldo >= Dem.  │    │   Saldo < Dem.   │
        └──────────────────┘    └──────────────────┘
                    ↓                     ↓
        ┌──────────────────┐    ┌──────────────────┐
        │ Consumo Interno  │    │ Requisição Comp. │
        │   Registra CI    │    │  Registra Req.   │
        └──────────────────┘    └──────────────────┘
                    ↓                     ↓
        ┌──────────────────┐    ┌──────────────────┐
        │  Saldo Reservado │    │  Compra Externa  │
        │  -quantidade     │    │  (Novo fornec.)  │
        └──────────────────┘    └──────────────────┘
```

---

## 📈 Views Operacionais

| View | Propósito | Consulta Principal |
|------|-----------|-------------------|
| `vw_demanda_bom_of` | Demanda de cada componente por OF | `ordens_fabricacao` + `bom_itens` |
| `vw_demanda_estoque` | Cobertura de estoque para demanda | `vw_demanda_bom_of` + `estoque_saldos` |
| `vw_demanda_consumo_compra` | Necessidade de compra após estoque/CI | `vw_demanda_estoque` + `consumos_internos` + `requisicoes` |
| `vw_of_consumo_detalhado` | Detalhes de consumo por OF | `ordens_fabricacao` + `bom_itens` + várias JOINs |
| `vw_of_fluxo_operacional` | Agregação do fluxo por OF | `vw_of_consumo_detalhado` agrupado |

---

## 🎨 Frontend Integrado

### Telas criadas:

1. **Dashboard** (`src/app/dashboard/page.tsx`)
   - 4 cards de resumo (OF, Demanda BOM, Falta Estoque, Compra Externa)
   - Tabela de fluxo operacional (top 5 OFs)

2. **Tela Operacional de OF** (`src/app/ordens/[id]/page.tsx`)
   - Resumo da OF com progress bar
   - Dados da BOM e datas
   - Tabela detalhada de materiais com estoque/consumo/compra

---

## ✅ Checklist de Execução

- [ ] Executar `202606050036_all_migrations_consolidated.sql` no Supabase
- [ ] Verificar tabelas e views no Dashboard
- [ ] Testar endpoint dashboard (`http://localhost:3000/dashboard`)
- [ ] Testar tela de OF (`http://localhost:3000/ordens/[id]`)
- [ ] Configurar `SUPABASE_SERVICE_KEY` se quiser usar funções administrativas

---

## 🚨 Dependências

As migrations requerem que as seguintes tabelas/funções já existam:

- `auth.users`
- `public.empresas`
- `public.empresa_atual_id()` - função helper
- `public.set_updated_at()` - trigger function
- `public.projetos`
- `public.projeto_itens`
- `public.materias_primas`
- `public.estoque_saldos`
- `public.estoque_movimentacoes`
- `public.consumos_internos`
- `public.requisicoes_compra`
- `public.requisicao_compra_itens`
- `public.planejamentos_compra`
- `public.planejamento_compra_origens`
- `public.pedidos_compra`
- `public.pedido_compra_itens`
- `public.numeracao_configuracoes`

---

**Criado em:** 2026-06-06  
**Status:** ✅ Pronto para execução
