# 🚀 Plano de Ação - Execução das Migrations

## 📍 Onde Estamos

✅ Todas as migrations SQL foram criadas e testadas  
✅ Frontend screens (Dashboard e Tela de OF) estão prontos  
✅ Supabase está configurado com credenciais corretas  
❌ **Próxima etapa: Executar as migrations no Supabase**

---

## 🎯 Próximos Passos

### PASSO 1: Executar as Migrations (5 minutos)

#### Opção A: Via Dashboard Supabase (RECOMENDADO - Mais fácil)

1. Abra https://app.supabase.com
2. Entre no projeto "sistema-producao"
3. Vá para **SQL Editor** → **New Query**
4. Abra o arquivo: `supabase/migrations/202606050036_all_migrations_consolidated.sql`
5. Copie TODO o conteúdo
6. Cole no SQL Editor do Supabase
7. Clique em **Run** (ou `Ctrl+Enter`)
8. **Aguarde** até completar (deve levar menos de 30 segundos)
9. Procure por erros - se não houver, ✅ sucesso!

#### Opção B: Via Supabase CLI (Se tiver instalado)

```bash
cd c:\Codex\sistema-producao
supabase login
supabase db push
```

---

### PASSO 2: Validar Execução (2 minutos)

No SQL Editor do Supabase, execute:

```sql
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ordens_fabricacao') THEN '✅ Migrations OK'
    ELSE '❌ Verifique os erros acima'
  END as status;
```

Se retornar `✅ Migrations OK`, você pode prosseguir!

---

### PASSO 3: Testar o Frontend (5 minutos)

1. Abra um terminal na raiz do projeto
2. Execute:
```bash
npm run dev
```

3. Acesse os endpoints:
   - Dashboard: http://localhost:3000/dashboard
   - Verificar se carrega os cards com dados

4. Se houver erro de conexão, verifique:
   - Variáveis de ambiente (.env.local)
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY

---

## 📋 O que foi criado

### Tabelas SQL:
- `itens_industriais` - Catálogo de PNs
- `boms` - Estrutura BOM
- `bom_itens` - Componentes de BOM
- `ordens_fabricacao` - Ordens de fabricação

### Views SQL:
- `vw_demanda_bom_of` - Demanda de materiais
- `vw_demanda_estoque` - Cobertura de estoque
- `vw_demanda_consumo_compra` - Necessidade de compra
- `vw_of_consumo_detalhado` - Detalhes de consumo
- `vw_of_fluxo_operacional` - Fluxo operacional agregado

### Frontend Screens:
- [Dashboard](http://localhost:3000/dashboard) - Resumo operacional
- [Tela de OF](http://localhost:3000/ordens/[id]) - Detalhe de ordem de fabricação

---

## 🔍 Troubleshooting

### Erro: "relation 'public.ordens_fabricacao' does not exist"
- ❌ As migrations NÃO foram executadas
- ✅ Execute o arquivo consolidado no Supabase Dashboard

### Erro: "permission denied for function"
- ❌ A função `empresa_atual_id()` não existe
- ✅ Verifique se as migrations base (projetos, estoque) foram executadas

### Dashboard mostra "Supabase não configurado"
- ❌ Variáveis de ambiente não estão corretas
- ✅ Verifique .env.local

---

## ✅ Checklist Final

- [ ] Migrations executadas no Supabase
- [ ] Validação retornou `✅ Migrations OK`
- [ ] Dashboard carrega com dados
- [ ] Tela de OF funciona
- [ ] ESLint passa (`npm run lint`)
- [ ] TypeScript compila (`npx tsc --noEmit`)

---

## 📞 Informações de Suporte

### Arquivos importantes:
- 📖 [MIGRATIONS_README.md](../MIGRATIONS_README.md) - Instruções detalhadas
- 📊 [MIGRATIONS_SUMMARY.md](../MIGRATIONS_SUMMARY.md) - Sumário técnico
- 🔍 [supabase/migrations/202606050037_validation_check.sql](../supabase/migrations/202606050037_validation_check.sql) - Script de validação

### URLs:
- Supabase Dashboard: https://app.supabase.com
- Projeto: sistema-producao
- API URL: https://xttyiffmtsmraqroalrb.supabase.co

---

## 🎓 Próximas Features (Após migrations)

1. **Criar UI de Criação de OF**
   - Form com seleção de projeto, produto, BOM, quantidade
   - Chamar função `criar_ordem_fabricacao_operacional()`

2. **Atualizar Produção**
   - Input para registrar quantidade produzida
   - Atualizar progress bar da OF

3. **Gestão de BOMs**
   - Interface para criar/editar BOMs
   - Validação de estrutura

4. **Requisições de Compra**
   - UI para aceitar/rejeitar requisições automáticas
   - Integração com fornecedores

---

**Última atualização:** 2026-06-06  
**Status:** 🟡 Aguardando execução das migrations
