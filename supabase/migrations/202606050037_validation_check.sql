-- Script de validação das migrations
-- Execute este arquivo no SQL Editor do Supabase para verificar se as migrations foram aplicadas corretamente

-- ============================================================================
-- Verifica se todas as tabelas foram criadas
-- ============================================================================

SELECT 
  'Verificando tabelas...' as status;

-- Esperadas 4 tabelas novas:
SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'itens_industriais') THEN '✅ itens_industriais'
    ELSE '❌ itens_industriais não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'boms') THEN '✅ boms'
    ELSE '❌ boms não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'bom_itens') THEN '✅ bom_itens'
    ELSE '❌ bom_itens não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'ordens_fabricacao') THEN '✅ ordens_fabricacao'
    ELSE '❌ ordens_fabricacao não encontrada'
  END;

-- ============================================================================
-- Verifica se as colunas foram adicionadas
-- ============================================================================

SELECT 
  'Verificando colunas adicionadas...' as status;

SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'projeto_itens' AND column_name = 'bom_id') THEN '✅ projeto_itens.bom_id'
    ELSE '❌ projeto_itens.bom_id não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'consumos_internos' AND column_name = 'of_id') THEN '✅ consumos_internos.of_id'
    ELSE '❌ consumos_internos.of_id não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'requisicoes_compra' AND column_name = 'of_id') THEN '✅ requisicoes_compra.of_id'
    ELSE '❌ requisicoes_compra.of_id não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'pedidos_compra' AND column_name = 'of_id') THEN '✅ pedidos_compra.of_id'
    ELSE '❌ pedidos_compra.of_id não encontrada'
  END;

-- ============================================================================
-- Verifica se as views foram criadas
-- ============================================================================

SELECT 
  'Verificando views operacionais...' as status;

SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'vw_demanda_bom_of') THEN '✅ vw_demanda_bom_of'
    ELSE '❌ vw_demanda_bom_of não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'vw_demanda_estoque') THEN '✅ vw_demanda_estoque'
    ELSE '❌ vw_demanda_estoque não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'vw_demanda_consumo_compra') THEN '✅ vw_demanda_consumo_compra'
    ELSE '❌ vw_demanda_consumo_compra não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'vw_of_consumo_detalhado') THEN '✅ vw_of_consumo_detalhado'
    ELSE '❌ vw_of_consumo_detalhado não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.views WHERE table_name = 'vw_of_fluxo_operacional') THEN '✅ vw_of_fluxo_operacional'
    ELSE '❌ vw_of_fluxo_operacional não encontrada'
  END;

-- ============================================================================
-- Verifica se as funções foram criadas
-- ============================================================================

SELECT 
  'Verificando funções...' as status;

SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'gerar_numero_entidade') THEN '✅ gerar_numero_entidade'
    ELSE '❌ gerar_numero_entidade não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'set_ordem_fabricacao_numero') THEN '✅ set_ordem_fabricacao_numero'
    ELSE '❌ set_ordem_fabricacao_numero não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.routines WHERE routine_name = 'criar_ordem_fabricacao_operacional') THEN '✅ criar_ordem_fabricacao_operacional'
    ELSE '❌ criar_ordem_fabricacao_operacional não encontrada'
  END;

-- ============================================================================
-- Verifica se os triggers foram criados
-- ============================================================================

SELECT 
  'Verificando triggers...' as status;

SELECT 
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'set_ordem_fabricacao_numero') THEN '✅ set_ordem_fabricacao_numero'
    ELSE '❌ set_ordem_fabricacao_numero não encontrada'
  END,
  CASE 
    WHEN EXISTS(SELECT 1 FROM information_schema.triggers WHERE trigger_name = 'set_ordens_fabricacao_updated_at') THEN '✅ set_ordens_fabricacao_updated_at'
    ELSE '❌ set_ordens_fabricacao_updated_at não encontrada'
  END;

-- ============================================================================
-- Resumo final
-- ============================================================================

SELECT 
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_name IN ('itens_industriais', 'boms', 'bom_itens', 'ordens_fabricacao')) as tabelas_criadas,
  (SELECT COUNT(*) FROM information_schema.views 
   WHERE table_name LIKE 'vw_of_%' OR table_name LIKE 'vw_demanda_%') as views_criadas,
  (SELECT COUNT(*) FROM information_schema.routines 
   WHERE routine_name IN ('gerar_numero_entidade', 'set_ordem_fabricacao_numero', 'criar_ordem_fabricacao_operacional')) as funcoes_criadas
UNION ALL
SELECT 4, 5, 3;

SELECT '📊 Se os números da primeira linha forem iguais aos da segunda linha (4, 5, 3), então as migrations foram aplicadas com sucesso! ✅' as resultado;
