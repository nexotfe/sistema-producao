-- Migration corretiva - Fase 7 (DEC-007 §6/§7): renomeia as duas
-- policies de escrita de bom_operacao_dependencias_subconjunto.
--
-- Os nomes originais, como escritos na migration 202608120001, tinham
-- 66 bytes:
--   "nexotfe bom operacao dependencias subconjunto insert mesma empresa"
--   "nexotfe bom operacao dependencias subconjunto update mesma empresa"
-- Isso excede o limite de identificador do Postgres (NAMEDATALEN=64,
-- 63 bytes utilizáveis) - o Postgres truncou os dois silenciosamente,
-- sem erro, na aplicação real (2026-08-12, via SQL Editor). O nome que
-- de fato existe no catálogo hoje é:
--   "nexotfe bom operacao dependencias subconjunto insert mesma empr"
--   "nexotfe bom operacao dependencias subconjunto update mesma empr"
-- (63 bytes cada, confirmado por auditoria de leitura em pg_policies -
-- ver DEC-007 §6.1 para o relato completo do incidente: a migration
-- 202608120001 foi colada por engano no SQL Editor em vez do script de
-- teste, e a auditoria pós-aplicação confirmou que todo o restante do
-- schema aplicado bate exatamente com o arquivo, sem nenhum outro
-- desvio - só esses dois nomes truncados).
--
-- Isto NÃO altera a migration 202608120001 já aplicada (nunca se edita
-- silenciosamente uma migration já aplicada em produção) - é uma
-- migration nova, separada, só de renomeação.
--
-- ALTER POLICY ... RENAME TO troca exclusivamente o identificador -
-- USING, WITH CHECK, roles e comando (FOR INSERT / FOR UPDATE)
-- continuam exatamente os mesmos já aplicados, sem risco de divergência
-- de uma recriação manual (drop+create). É por isso que RENAME foi
-- escolhido em vez de recriar as policies do zero.
--
-- Nomes novos (53 bytes cada) seguem a mesma convenção
-- "nexotfe {tabela} {ação} mesma empresa" usada no resto do schema
-- (ex.: "nexotfe bom operacoes insert mesma empresa"), encurtada para
-- "dependencias subconjunto" (sem repetir "bom operacao", já implícito
-- no nome da tabela) - com folga suficiente para nunca mais truncar.

begin;

alter policy "nexotfe bom operacao dependencias subconjunto insert mesma empr"
  on public.bom_operacao_dependencias_subconjunto
  rename to "nexotfe dependencias subconjunto insert mesma empresa";

alter policy "nexotfe bom operacao dependencias subconjunto update mesma empr"
  on public.bom_operacao_dependencias_subconjunto
  rename to "nexotfe dependencias subconjunto update mesma empresa";

commit;
