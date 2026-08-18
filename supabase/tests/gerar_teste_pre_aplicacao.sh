#!/usr/bin/env bash
# Gera, MECANICAMENTE (nunca copiado à mão), um script de teste
# PRÉ-aplicação para 202608180001_generalizar_dependencia_item_roteiro.sql
# - roda o DDL exato da migration real (sem o "commit;" dela) seguido do
# teste pós-aplicação real (sem o "begin;" dele, que seria redundante -
# a transação já está aberta pela migration), tudo numa ÚNICA transação
# externa, terminando em rollback.
#
# O ARQUIVO GERADO NUNCA FICA DENTRO DO REPOSITÓRIO (decisão de
# segurança confirmada com o usuário): por padrão, sai para um arquivo
# temporário do sistema operacional (`mktemp`), fora de `supabase/tests/`
# - reduz o risco de alguém, mais tarde, colar no SQL Editor uma versão
# velha esquecida no repo em vez de gerar uma nova. Este script IMPRIME
# o caminho gerado e um lembrete explícito para apagá-lo depois de usar -
# nunca apaga sozinho (o usuário pode querer revisar o conteúdo antes).
#
# GARANTIA DE FIDELIDADE (o motivo de este ser um script, não um arquivo
# .sql mantido à mão): o trecho de DDL no arquivo gerado é produzido por
# `sed` removendo apenas a linha exata "commit;" da migration real -
# nunca uma retranscrição. Este script embute, no cabeçalho do arquivo
# gerado, o SHA256 do arquivo-fonte E marcadores de delimitação
# (<<<GERADO:...>>>) que permitem extrair de volta o trecho de DDL usado
# e compará-lo por `diff` contra a migration real - ver a função
# verificar_fidelidade() abaixo, chamada automaticamente ao final da
# geração.
#
# Por que isto existe (e não um 2º arquivo .sql mantido à mão): incidente
# documentado em supabase/tests/fase7_dependencia_subconjunto_teste.sql -
# uma versão antiga daquele arquivo continha, escrito à mão, o DDL
# INTEIRO da migration correspondente (inclusive um "commit;" próprio) -
# colar o arquivo errado no SQL Editor tornou mudanças permanentes antes
# da hora. Gerar mecanicamente, sempre a partir dos 2 arquivos reais,
# elimina a possibilidade de uma cópia divergir do original - não há
# cópia, há extração. E nunca deixar o resultado gerado dentro do repo
# elimina a possibilidade de rodar, por engano, uma versão desatualizada.
#
# Uso:
#   bash supabase/tests/gerar_teste_pre_aplicacao.sh [caminho_de_saida.sql]
#   (sem argumento: gera em um arquivo temporário do sistema operacional)
#
# NÃO executa nada em nenhum banco - só gera um arquivo de texto local,
# para revisão humana e execução manual (colar no SQL Editor) depois.
# APAGUE o arquivo gerado depois de usar (o script lembra isso ao final).
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ_REPO="$(cd "$DIR_SCRIPT/../.." && pwd)"
cd "$RAIZ_REPO"

MIGRATION="supabase/migrations/202608180001_generalizar_dependencia_item_roteiro.sql"
TESTE_POS="supabase/tests/generalizacao_dependencia_item_roteiro_teste.sql"

if [ $# -ge 1 ]; then
  SAIDA="$1"
else
  SAIDA="$(mktemp --suffix=.sql -t pre_aplicacao_generalizacao_XXXXXX)"
fi

# Resolve para caminho ABSOLUTO antes de comparar - um argumento
# RELATIVO (ex.: "supabase/tests/x.sql") nunca bate com o prefixo
# absoluto de $RAIZ_REPO num `case`/glob de string pura, então a
# comparação precisa ser feita sobre 2 caminhos já resolvidos. O arquivo
# ainda não existe neste ponto, então usa o diretório-pai (que precisa
# existir) + o nome do arquivo, em vez de `realpath` no caminho inteiro.
DIR_SAIDA="$(dirname "$SAIDA")"
NOME_SAIDA="$(basename "$SAIDA")"
if [ ! -d "$DIR_SAIDA" ]; then
  echo "ERRO: diretório de saída '$DIR_SAIDA' não existe." >&2
  exit 1
fi
SAIDA_ABSOLUTA="$(cd "$DIR_SAIDA" && pwd)/$NOME_SAIDA"

case "$SAIDA_ABSOLUTA" in
  "$RAIZ_REPO"/*)
    echo "ERRO: o caminho de saída '$SAIDA' resolve para '$SAIDA_ABSOLUTA', DENTRO do repositório ('$RAIZ_REPO') - por decisão de segurança, o arquivo gerado nunca deve ser commitado nem permanecer em supabase/tests/. Use um caminho fora do repositório (ou omita o argumento para gerar em um arquivo temporário do sistema)." >&2
    exit 1
    ;;
esac
SAIDA="$SAIDA_ABSOLUTA"

for arq in "$MIGRATION" "$TESTE_POS"; do
  if [ ! -f "$arq" ]; then
    echo "ERRO: arquivo-fonte não encontrado: $arq" >&2
    exit 1
  fi
done

# Cada fonte precisa ter EXATAMENTE 1 ocorrência da linha que será
# removida - nunca remove "a primeira que encontrar" às cegas se houver
# ambiguidade (isso indicaria que os arquivos-fonte mudaram de forma
# inesperada desde que este gerador foi escrito).
n_commit=$(grep -c '^commit;$' "$MIGRATION")
n_begin=$(grep -c '^begin;$' "$TESTE_POS")
if [ "$n_commit" -ne 1 ]; then
  echo "ERRO: esperava exatamente 1 linha 'commit;' em $MIGRATION, encontrei $n_commit - revise antes de gerar (o gerador não decide sozinho qual remover)." >&2
  exit 1
fi
if [ "$n_begin" -ne 1 ]; then
  echo "ERRO: esperava exatamente 1 linha 'begin;' em $TESTE_POS, encontrei $n_begin - revise antes de gerar." >&2
  exit 1
fi

sha_migration=$(sha256sum "$MIGRATION" | cut -d' ' -f1)
sha_teste=$(sha256sum "$TESTE_POS" | cut -d' ' -f1)

{
  echo "-- GERADO MECANICAMENTE por supabase/tests/gerar_teste_pre_aplicacao.sh - NÃO EDITAR À MÃO."
  echo "-- NÃO É PARA FICAR NO REPOSITÓRIO - apague este arquivo depois de usar."
  echo "-- Regenerar sempre que a migration ou o teste pós-aplicação mudarem - nunca reutilizar uma cópia velha."
  echo "-- Fonte 1 (migration, sem a linha 'commit;' final): $MIGRATION"
  echo "--   sha256 do arquivo-fonte completo: $sha_migration"
  echo "-- Fonte 2 (teste pós-aplicação, sem a linha 'begin;' inicial): $TESTE_POS"
  echo "--   sha256 do arquivo-fonte completo: $sha_teste"
  echo "-- Gerado em: $(date -u +%FT%TZ)"
  echo "--"
  echo "-- MODO PRÉ-APLICAÇÃO: a transação abaixo roda o DDL da migration"
  echo "-- (que já testa a si mesma via o passo 3 - aborta se o backfill"
  echo "-- encontrar dado inconsistente) e, na sequência, dentro da MESMA"
  echo "-- transação ainda não commitada, todos os testes comportamentais"
  echo "-- do arquivo pós-aplicação, incluindo a pré-checagem de fixtures"
  echo "-- que faz o script inteiro abortar cedo se algum dado necessário"
  echo "-- faltar no ambiente. Termina em rollback - nada persiste."
  echo
  echo "-- <<<GERADO:INICIO_DDL_MIGRATION>>>"
  sed '/^commit;$/d' "$MIGRATION"
  echo "-- <<<GERADO:FIM_DDL_MIGRATION>>>"
  echo
  sed '/^begin;$/d' "$TESTE_POS"
} > "$SAIDA"

echo "Gerado: $SAIDA"

verificar_fidelidade() {
  # Extrai de volta o trecho de DDL usado no arquivo gerado (entre os 2
  # marcadores) e compara, por diff, contra a migration real com a
  # mesma linha 'commit;' removida - devem ser IDÊNTICOS, byte a byte.
  local extraido
  extraido=$(sed -n '/<<<GERADO:INICIO_DDL_MIGRATION>>>/,/<<<GERADO:FIM_DDL_MIGRATION>>>/p' "$SAIDA" | sed '1d;$d')
  local esperado
  esperado=$(sed '/^commit;$/d' "$MIGRATION")
  if [ "$extraido" = "$esperado" ]; then
    echo "FIDELIDADE OK: o trecho de DDL no arquivo gerado é byte a byte idêntico à migration real (menos a linha 'commit;')."
    return 0
  else
    echo "FIDELIDADE FALHOU: o trecho de DDL no arquivo gerado DIVERGE da migration real - não use o arquivo gerado. Isto não deveria acontecer (é extração mecânica); investigue o script." >&2
    diff <(echo "$esperado") <(echo "$extraido") >&2 || true
    return 1
  fi
}

verificar_fidelidade

echo
echo "Para conferir de novo manualmente a qualquer momento:"
echo "  diff <(sed '/^commit;\$/d' '$MIGRATION') <(sed -n '/<<<GERADO:INICIO_DDL_MIGRATION>>>/,/<<<GERADO:FIM_DDL_MIGRATION>>>/p' '$SAIDA' | sed '1d;\$d')"
echo
echo "Este script NÃO executou nada em nenhum banco - '$SAIDA' é só texto local, fora do repositório, para revisão humana antes de colar manualmente no SQL Editor."
echo "LEMBRETE: apague '$SAIDA' depois de usar - nunca reaproveite um arquivo gerado em uma sessão anterior."
