#!/usr/bin/env bash
# Gera, MECANICAMENTE (nunca copiado à mão), o script de teste
# PRÉ-aplicação para 202608180002_cenarios_comerciais_aprovados.sql -
# script DEDICADO a este par (não reaproveita
# supabase/tests/gerar_teste_pre_aplicacao.sh, que é específico de
# 202608180001 e assume que a migration tem sua PRÓPRIA linha "begin;"/
# "commit;" - esta migration não tem nenhuma das duas, mesmo estilo de
# 202608130001/empresa_convencao_horas_adicionais). Diferença estrutural
# central: como a migration não abre transação própria, ESTE gerador
# sintetiza o "begin;" externo; a migration entra 100% VERBATIM (nada é
# removido dela desta vez - não há o que remover), seguida do teste
# pós-aplicação real com sua própria linha "begin;" removida (redundante -
# a transação já foi aberta pelo "begin;" sintetizado acima). Termina no
# "rollback;" que já existe dentro do próprio arquivo de teste.
#
# O ARQUIVO GERADO NUNCA FICA DENTRO DO REPOSITÓRIO (mesma decisão de
# segurança do gerador original) - por padrão, sai para um arquivo
# temporário do sistema operacional (`mktemp`), fora de `supabase/tests/`.
# Este script NUNCA apaga o arquivo sozinho no momento da geração (ele
# ainda precisa ser revisado e colado manualmente no SQL Editor depois) -
# mas IMPRIME, ao final, o comando exato para apagá-lo, e a execução
# real deste teste (quando autorizada) deve terminar apagando-o - "ao
# final do fluxo", não "ao final da geração", que deixaria nada para
# revisar/colar.
#
# GARANTIA DE FIDELIDADE (por que isto é um script, não um .sql mantido
# à mão): o trecho de "DDL da migration" no arquivo gerado é a migration
# real, importada por `cat`, sem nenhuma edição - nunca uma
# retranscrição. O trecho de "teste pós-aplicação" é produzido por `sed`
# removendo só a linha exata "begin;" do teste real. O cabeçalho do
# arquivo gerado embute o SHA-256 dos 2 arquivos-fonte E marcadores de
# delimitação (<<<GERADO:...>>>) que permitem extrair de volta cada
# trecho e compará-lo por `diff` contra o arquivo-fonte correspondente -
# ver verificar_fidelidade() abaixo, chamada automaticamente ao final da
# geração. Verificação adicional (pedida explicitamente, além do padrão
# do gerador original): o script conta, no arquivo GERADO final, toda
# ocorrência de "commit"/"COMMIT" executável e aborta se encontrar
# qualquer uma - a transação inteira só pode terminar em rollback.
#
# Uso:
#   bash supabase/tests/gerar_teste_pre_aplicacao_cenarios_comerciais_aprovados.sh [caminho_de_saida.sql]
#   (sem argumento: gera em um arquivo temporário do sistema operacional)
#
# NÃO executa nada em nenhum banco - só gera um arquivo de texto local,
# para revisão humana e execução manual (colar no SQL Editor, ou
# `supabase db query --linked --file`) depois. Nunca usa `db push`,
# `--include-all` nem `migration repair` - a aplicação real (fora deste
# script) segue sendo manual, uma escrita por vez, com confirmação
# própria.
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ_REPO="$(cd "$DIR_SCRIPT/../.." && pwd)"
cd "$RAIZ_REPO"

MIGRATION="supabase/migrations/202608180002_cenarios_comerciais_aprovados.sql"
TESTE_POS="supabase/tests/cenarios_comerciais_aprovados_teste.sql"

if [ $# -ge 1 ]; then
  SAIDA="$1"
else
  SAIDA="$(mktemp --suffix=.sql -t pre_aplicacao_cenarios_comerciais_aprovados_XXXXXX)"
fi

# Mesma checagem de segurança do gerador original: resolve para caminho
# ABSOLUTO antes de comparar - um argumento RELATIVO nunca bate com o
# prefixo absoluto de $RAIZ_REPO numa comparação de string pura.
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

# Esta migration NÃO tem begin;/commit; próprios (diferente de
# 202608180001) - assumido explicitamente aqui, nunca silenciosamente.
# Se isso deixar de ser verdade no futuro (migration reescrita com
# transação própria), o gerador aborta em vez de produzir um script
# com 2 BEGINs aninhados incorretamente.
n_begin_migration=$(grep -c '^begin;$' "$MIGRATION" || true)
n_commit_migration=$(grep -c '^commit;$' "$MIGRATION" || true)
if [ "$n_begin_migration" -ne 0 ] || [ "$n_commit_migration" -ne 0 ]; then
  echo "ERRO: esperava ZERO linhas 'begin;'/'commit;' em $MIGRATION (script dedicado a migrations sem transação própria) - encontrei $n_begin_migration begin(s) e $n_commit_migration commit(s). Use supabase/tests/gerar_teste_pre_aplicacao.sh (ou um script análogo) para migrations com transação própria." >&2
  exit 1
fi

n_begin_teste=$(grep -c '^begin;$' "$TESTE_POS")
n_rollback_teste=$(grep -c '^rollback;$' "$TESTE_POS")
if [ "$n_begin_teste" -ne 1 ]; then
  echo "ERRO: esperava exatamente 1 linha 'begin;' em $TESTE_POS, encontrei $n_begin_teste - revise antes de gerar (o gerador não decide sozinho qual remover)." >&2
  exit 1
fi
if [ "$n_rollback_teste" -ne 1 ]; then
  echo "ERRO: esperava exatamente 1 linha 'rollback;' em $TESTE_POS, encontrei $n_rollback_teste - revise antes de gerar." >&2
  exit 1
fi

sha_migration=$(sha256sum "$MIGRATION" | cut -d' ' -f1)
sha_teste=$(sha256sum "$TESTE_POS" | cut -d' ' -f1)

{
  echo "-- GERADO MECANICAMENTE por supabase/tests/gerar_teste_pre_aplicacao_cenarios_comerciais_aprovados.sh - NÃO EDITAR À MÃO."
  echo "-- NÃO É PARA FICAR NO REPOSITÓRIO - apague este arquivo depois de usar."
  echo "-- Regenerar sempre que a migration ou o teste pós-aplicação mudarem - nunca reutilizar uma cópia velha."
  echo "-- Fonte 1 (migration, VERBATIM - sem begin;/commit; próprios, nada removido): $MIGRATION"
  echo "--   sha256 do arquivo-fonte completo: $sha_migration"
  echo "-- Fonte 2 (teste pós-aplicação, sem a linha 'begin;' inicial - o rollback; final é mantido): $TESTE_POS"
  echo "--   sha256 do arquivo-fonte completo: $sha_teste"
  echo "-- Gerado em: $(date -u +%FT%TZ)"
  echo "--"
  echo "-- MODO PRÉ-APLICAÇÃO: begin; sintetizado por este gerador (a migration"
  echo "-- não abre transação própria) + DDL exato da migration + todos os"
  echo "-- testes comportamentais do arquivo pós-aplicação (incluindo a"
  echo "-- pré-checagem de fixtures, que aborta o script inteiro se algum"
  echo "-- dado necessário faltar no ambiente - sem nenhum caso 'PULADO'"
  echo "-- neste par). Termina no rollback; que já vem dentro do teste -"
  echo "-- nada persiste."
  echo
  echo "begin;"
  echo
  echo "-- <<<GERADO:INICIO_DDL_MIGRATION>>>"
  cat "$MIGRATION"
  echo "-- <<<GERADO:FIM_DDL_MIGRATION>>>"
  echo
  echo "-- <<<GERADO:INICIO_TESTE_POS>>>"
  sed '/^begin;$/d' "$TESTE_POS"
  echo "-- <<<GERADO:FIM_TESTE_POS>>>"
} > "$SAIDA"

echo "Gerado: $SAIDA"

verificar_fidelidade() {
  local extraido_migration
  extraido_migration=$(sed -n '/<<<GERADO:INICIO_DDL_MIGRATION>>>/,/<<<GERADO:FIM_DDL_MIGRATION>>>/p' "$SAIDA" | sed '1d;$d')
  local esperado_migration
  esperado_migration=$(cat "$MIGRATION")
  if [ "$extraido_migration" != "$esperado_migration" ]; then
    echo "FIDELIDADE FALHOU (migration): o trecho de DDL no arquivo gerado DIVERGE da migration real - não use o arquivo gerado." >&2
    diff <(echo "$esperado_migration") <(echo "$extraido_migration") >&2 || true
    return 1
  fi
  echo "FIDELIDADE OK (migration): o trecho de DDL no arquivo gerado é byte a byte idêntico à migration real (nada foi removido - a migration não tem begin;/commit; próprios)."

  local extraido_teste
  extraido_teste=$(sed -n '/<<<GERADO:INICIO_TESTE_POS>>>/,/<<<GERADO:FIM_TESTE_POS>>>/p' "$SAIDA" | sed '1d;$d')
  local esperado_teste
  esperado_teste=$(sed '/^begin;$/d' "$TESTE_POS")
  if [ "$extraido_teste" != "$esperado_teste" ]; then
    echo "FIDELIDADE FALHOU (teste): o trecho de teste pós-aplicação no arquivo gerado DIVERGE do teste real (menos a linha 'begin;') - não use o arquivo gerado." >&2
    diff <(echo "$esperado_teste") <(echo "$extraido_teste") >&2 || true
    return 1
  fi
  echo "FIDELIDADE OK (teste): o trecho de teste pós-aplicação no arquivo gerado é byte a byte idêntico ao teste real (menos a linha 'begin;')."
  return 0
}

verificar_fidelidade

# Verificação extra (pedida explicitamente): zero COMMIT EXECUTÁVEL em
# todo o arquivo gerado - a transação inteira só pode terminar em
# rollback. Âncora no INÍCIO da linha (ignorando espaço em branco) para
# nunca confundir uma linha de comentário SQL (sempre começa com "--")
# que só MENCIONA a palavra "commit" em texto explicativo (ex.: este
# próprio cabeçalho, ou os comentários do arquivo de teste) com um
# statement de verdade - comentário nunca começa com a palavra "commit"
# sem o "--" antes.
if grep -Eiq '^[[:space:]]*commit([[:space:]]+work)?[[:space:]]*;' "$SAIDA"; then
  echo "ERRO: o arquivo gerado contém um COMMIT executável de verdade - revise manualmente antes de usar (esperado: zero, a transação só pode terminar em rollback)." >&2
  grep -Ein '^[[:space:]]*commit([[:space:]]+work)?[[:space:]]*;' "$SAIDA" >&2
  exit 1
fi
echo "VERIFICAÇÃO OK: nenhum COMMIT executável no arquivo gerado (menções à palavra em comentário não contam - checagem ancorada ao início da linha, comentário sempre começa com '--')."

n_begin_final=$(grep -c '^begin;$' "$SAIDA")
n_rollback_final=$(grep -c '^rollback;$' "$SAIDA")
echo "Contagem no arquivo final: begin;=$n_begin_final, rollback;=$n_rollback_final (esperado: 1 e 1)."
if [ "$n_begin_final" -ne 1 ] || [ "$n_rollback_final" -ne 1 ]; then
  echo "ERRO: contagem de begin;/rollback; no arquivo final fora do esperado - não use o arquivo gerado." >&2
  exit 1
fi

echo
echo "Para conferir de novo manualmente a qualquer momento:"
echo "  diff '$MIGRATION' <(sed -n '/<<<GERADO:INICIO_DDL_MIGRATION>>>/,/<<<GERADO:FIM_DDL_MIGRATION>>>/p' '$SAIDA' | sed '1d;\$d')"
echo "  diff <(sed '/^begin;\$/d' '$TESTE_POS') <(sed -n '/<<<GERADO:INICIO_TESTE_POS>>>/,/<<<GERADO:FIM_TESTE_POS>>>/p' '$SAIDA' | sed '1d;\$d')"
echo
echo "Este script NÃO executou nada em nenhum banco - '$SAIDA' é só texto local, fora do repositório, para revisão humana antes de colar manualmente no SQL Editor (ou 'npx supabase db query --linked --file $SAIDA' - nunca 'db push', '--include-all' nem 'migration repair')."
echo "OBRIGATÓRIO: apague '$SAIDA' ao final do fluxo (depois de revisar/executar) - nunca reaproveite um arquivo gerado em uma sessão anterior. Comando: rm '$SAIDA'"
