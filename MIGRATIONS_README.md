# Execução de Migrations Supabase - Sistema de Produção

## 📋 Resumo

Este documento descreve como executar todas as migrations SQL para as tabelas e views de Ordens de Fabricação (OF), BOM, Estoque e Fluxo Operacional no Supabase.

## 🚀 Opção 1: Execução rápida (Recomendado)

A forma mais simples é usar o arquivo consolidado que agrupa todas as migrations:

### Passos:

1. **Acesse o Supabase Dashboard**
   - Vá para: https://app.supabase.com
   - Entre no seu projeto "sistema-producao"

2. **Abra o SQL Editor**
   - No menu esquerdo, clique em "SQL Editor"
   - Clique em "New Query"

3. **Copie e execute o arquivo consolidado**
   - Abra o arquivo: `supabase/migrations/202606050036_all_migrations_consolidated.sql`
   - Copie **TODO** o conteúdo
   - Cole no SQL Editor do Supabase
   - Clique em "Run" (ou pressione `Ctrl+Enter`)

4. **Verifique o resultado**
   - Aguarde a execução completar
   - Procure por "Error" na resposta
   - Se nenhum erro aparecer, as migrations foram aplicadas com sucesso ✅

---

## 🔧 Opção 2: Execução via Supabase CLI

Se você tem o Supabase CLI instalado:

### Instalação da CLI (se não tiver):
```bash
npm install -g supabase
```

### Executar as migrations:
```bash
# Vá para a raiz do projeto
cd c:\Codex\sistema-producao

# Se não tiver, faça login
supabase login

# Aplique as migrations
supabase db push
```

---

## 📊 Tabelas e Views criadas

### Tabelas:
- `public.itens_industriais` - Catálogo de PNs/produtos
- `public.boms` - Estrutura BOM (Bill of Materials)
- `public.bom_itens` - Itens que compõem cada BOM
- `public.ordens_fabricacao` - Ordens de fabricação (OF)

### Views Operacionais:
- `vw_demanda_bom_of` - Demanda de materiais por OF baseada em BOM
- `vw_demanda_estoque` - Cobertura de estoque para demanda
- `vw_demanda_consumo_compra` - Necessidade de compra externa
- `vw_of_consumo_detalhado` - Detalhamento de consumo por OF
- `vw_of_fluxo_operacional` - Fluxo operacional agregado

### Colunas adicionadas:
- `consumos_internos.of_id` - Vincula CI a uma OF
- `estoque_movimentacoes.of_id` - Vincula movimentação a uma OF
- `requisicoes_compra.of_id` - Vincula requisição a uma OF
- `pedidos_compra.of_id` - Vincula pedido a uma OF
- `projeto_itens.bom_id` - Vincula item de projeto a uma BOM

### Funções:
- `public.gerar_numero_entidade(text)` - Gera número sequencial de OF
- `public.set_ordem_fabricacao_numero()` - Trigger que atribui número de OF

---

## ✅ Como validar

Após executar as migrations, verifique:

1. **No SQL Editor, execute:**
```sql
-- Verifique as tabelas
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
ORDER BY table_name;

-- Verifique as views
SELECT table_name FROM information_schema.views WHERE table_schema = 'public'
ORDER BY table_name;
```

2. **Procure por:**
   - ✅ `itens_industriais`
   - ✅ `boms`
   - ✅ `bom_itens`
   - ✅ `ordens_fabricacao`
   - ✅ `vw_demanda_bom_of`
   - ✅ `vw_demanda_estoque`
   - ✅ `vw_demanda_consumo_compra`
   - ✅ `vw_of_consumo_detalhado`
   - ✅ `vw_of_fluxo_operacional`

---

## 🐛 Troubleshooting

### Erro: "Função `empresa_atual_id()` não existe"
- Certifique-se de que as migrations base (projetos, estoque, etc) já foram executadas
- Esta função deve estar em uma migration anterior

### Erro: "Tabela `projeto_itens` não existe"
- As migrations de projetos devem ser executadas antes
- Verifique se `public.projetos` existe

### Erro: "Política de RLS já existe"
- Você pode estar tentando executar uma segunda vez
- Use `DROP POLICY IF EXISTS` antes de criar a policy

---

## 📝 Próximos passos

Após as migrations:

1. **Configure as variáveis de ambiente:**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

2. **Teste a tela de OF operacional:**
   - Vá para: `http://localhost:3000/ordens/[id]`
   - Substitua `[id]` por um UUID válido de OF

3. **Acesse o dashboard:**
   - Vá para: `http://localhost:3000/dashboard`
   - Verifique os cards de OF, BOM e demanda

---

## 🆘 Suporte

Se encontrar erros:

1. Verifique a ordem das migrations (32 → 33 → 34 → 35 → 36)
2. Consulte os logs no Supabase Dashboard → Logs
3. Procure por `FOREIGN KEY` ou constraint errors

---

**Última atualização: 2026-06-06**
