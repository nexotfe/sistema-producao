<#
  Executor da trilha LEGADA (compatível com produção real) para validar
  supabase/tests/fase8b_convencao_horas_adicionais_teste.sql.

  NUNCA toca em supabase/migrations/, supabase/baseline/, no projeto
  Supabase vinculado ou em dados reais - opera exclusivamente contra um
  container Docker de uma instância Supabase LOCAL já em execução
  (`npx supabase start`), usando psql DENTRO do container via
  `docker exec`/`docker cp` - nunca `supabase db query --file` (que
  falaria com o projeto vinculado) e nunca concatenação manual dos
  arquivos.

  Ordem fixa de aplicação (exigida pelo usuário, nunca alterar):
    1. supabase/tests/fixtures/legacy_profiles_auth.sql (fixture legada)
    2. supabase/migrations/202608130001_empresa_convencao_horas_adicionais.sql
    3. supabase/tests/fase8b_convencao_horas_adicionais_teste.sql
    4. consulta de resíduos (nova conexão psql, depois do ROLLBACK acima)

  Critério de aprovação (todos obrigatórios): preflight limpo, aplicação
  1/2 sem erro, teste 3 sem nenhuma ocorrência de "PULADO" e sem nenhum
  "FALHOU" (qualquer erro não tratado já aborta via ON_ERROR_STOP=1),
  ROLLBACK confirmado no output do teste, e a consulta de resíduos (4)
  reportando 0 linhas residuais com a tabela ainda existindo.

  Este script NUNCA reseta/derruba um container contaminado sozinho -
  se o preflight encontrar objetos legados já existentes, ele ABORTA
  (nunca mascara com IF NOT EXISTS nem limpa por conta própria). Depois
  de uma execução bem-sucedida, o container fica com os objetos desta
  fixture/migration permanentemente criados (não são desfeitos - só os
  DADOS de teste inseridos por fase8b_...teste.sql são desfeitos, pelo
  ROLLBACK do próprio arquivo) - para rodar de novo, recrie o ambiente
  (`npx supabase stop` + `npx supabase start`, ou um container novo).
#>
param(
  [string]$ContainerName = 'supabase_db_nexotfe-convencao-teste'
)

$ErrorActionPreference = 'Stop'

function Invoke-PsqlFileInContainer {
  param(
    [Parameter(Mandatory)] [string]$LocalPath,
    [Parameter(Mandatory)] [string]$Label
  )

  if (-not (Test-Path $LocalPath)) {
    throw "Arquivo não encontrado: $LocalPath"
  }

  $remoteName = "/tmp/legacy_convencao_$([System.IO.Path]::GetFileName($LocalPath))"

  Write-Host "==> $Label"
  & docker cp $LocalPath "${ContainerName}:${remoteName}"
  if ($LASTEXITCODE -ne 0) {
    throw "FALHOU: docker cp de '$LocalPath' para o container '$ContainerName'."
  }

  $output = & docker exec $ContainerName sh -c "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f $remoteName 2>&1"
  $exitCode = $LASTEXITCODE
  $output | ForEach-Object { Write-Host $_ }

  if ($exitCode -ne 0) {
    throw "FALHOU: $Label (psql saiu com código $exitCode - ver output acima)."
  }

  return $output
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Push-Location $workspace
try {
  $running = & docker ps --filter "name=^/$ContainerName`$" --format '{{.Names}}'
  if (-not $running) {
    throw "Container Docker '$ContainerName' não está em execução. Rode 'npx supabase start' antes (ambiente local descartável) - este script nunca inicia/derruba o stack sozinho, e nunca aponta para o projeto vinculado."
  }

  # ---------------------------------------------------------------------
  # Preflight: abortar se detectar qualquer objeto legado já existente,
  # ANTES de qualquer preparação - nunca mascarar ambiente contaminado.
  # ---------------------------------------------------------------------
  Write-Host "==> Preflight: verificando ambiente limpo em '$ContainerName'"
  $preflightSql = @'
select
  coalesce(to_regclass('public.profiles')::text, '-') as profiles,
  coalesce(to_regclass('public.usuarios')::text, '-') as usuarios,
  coalesce(to_regclass('public.empresas')::text, '-') as empresas,
  coalesce(to_regtype('public.nivel_acesso')::text, '-') as nivel_acesso,
  coalesce(to_regclass('public.empresa_convencao_horas_adicionais')::text, '-') as convencao,
  coalesce((select count(*)::text from auth.users where id in (
    '30000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003'
  )), '0') as auth_users_fixture;
'@
  $preflightFile = Join-Path $env:TEMP 'legacy_convencao_preflight.sql'
  Set-Content -Path $preflightFile -Value $preflightSql -Encoding utf8 -NoNewline

  $remotePreflight = '/tmp/legacy_convencao_preflight.sql'
  & docker cp $preflightFile "${ContainerName}:${remotePreflight}"
  if ($LASTEXITCODE -ne 0) { throw "FALHOU: docker cp do preflight." }

  $preflightOutput = & docker exec $ContainerName sh -c "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -F'|' -f $remotePreflight 2>&1"
  if ($LASTEXITCODE -ne 0) {
    $preflightOutput | ForEach-Object { Write-Host $_ }
    throw "FALHOU: preflight não executou (ver output acima)."
  }

  $preflightLine = ($preflightOutput | Where-Object { $_ -match '\|' } | Select-Object -First 1)
  if (-not $preflightLine) {
    $preflightRaw = $preflightOutput -join "`n"
    throw "FALHOU: preflight não devolveu linha reconhecível. Output bruto: $preflightRaw"
  }
  $cols = $preflightLine -split '\|'
  if (($cols[0] -ne '-') -or ($cols[1] -ne '-') -or ($cols[2] -ne '-') -or ($cols[3] -ne '-') -or ($cols[4] -ne '-') -or ($cols[5] -ne '0')) {
    throw "ABORTADO: ambiente '$ContainerName' NÃO está limpo (profiles=$($cols[0]) usuarios=$($cols[1]) empresas=$($cols[2]) nivel_acesso=$($cols[3]) empresa_convencao_horas_adicionais=$($cols[4]) auth.users_fixture=$($cols[5])). Esta fixture nunca roda sobre ambiente contaminado - recrie o container ('npx supabase stop' + 'npx supabase start', ou um container novo). Se só auth.users_fixture > 0 (schema public já limpo, mas sobraram linhas de auth.users de uma tentativa anterior - 'drop schema public cascade' não alcança o schema auth), remova manualmente as 3 linhas com id em 30000000-...-0001/0002/0003 antes de repetir."
  }
  Write-Host "Preflight OK: nenhum objeto legado encontrado."

  # ---------------------------------------------------------------------
  # 1/4 - Fixture legada (profiles/usuarios/empresas/enum/funções)
  # ---------------------------------------------------------------------
  Invoke-PsqlFileInContainer -LocalPath 'supabase/tests/fixtures/legacy_profiles_auth.sql' -Label '1/4 - Fixture legada'

  # ---------------------------------------------------------------------
  # 2/4 - Migration histórica real (schema/RPCs de convenção coletiva)
  # ---------------------------------------------------------------------
  Invoke-PsqlFileInContainer -LocalPath 'supabase/migrations/202608130001_empresa_convencao_horas_adicionais.sql' -Label '2/4 - Migration histórica 202608130001'

  # ---------------------------------------------------------------------
  # 3/4 - Teste pós-migration (BEGIN...ROLLBACK interno ao próprio
  # arquivo - nenhuma linha de teste sobrevive, o schema nunca é tocado).
  # ---------------------------------------------------------------------
  $testOutput = Invoke-PsqlFileInContainer -LocalPath 'supabase/tests/fase8b_convencao_horas_adicionais_teste.sql' -Label '3/4 - Teste fase8b_convencao_horas_adicionais_teste.sql'

  $puladoLines = $testOutput | Where-Object { $_ -match 'PULADO' }
  if ($puladoLines) {
    Write-Host '--- Linhas PULADO encontradas ---'
    $puladoLines | ForEach-Object { Write-Host $_ }
    throw "FALHOU: o teste reportou PULADO em pelo menos 1 cenário - isso é uma falha da FIXTURE (dado insuficiente), não do teste. Ajuste supabase/tests/fixtures/legacy_profiles_auth.sql, nunca fase8b_convencao_horas_adicionais_teste.sql."
  }

  $falhouLines = $testOutput | Where-Object { $_ -match 'FALHOU' -or $_ -match '^ERROR' }
  if ($falhouLines) {
    Write-Host '--- Linhas FALHOU/ERROR encontradas ---'
    $falhouLines | ForEach-Object { Write-Host $_ }
    throw "FALHOU: o teste reportou FALHOU/ERROR em pelo menos 1 cenário."
  }

  $rollbackConfirmado = $testOutput | Where-Object { $_ -match '^ROLLBACK$' }
  if (-not $rollbackConfirmado) {
    throw "FALHOU: o output do teste não confirmou ROLLBACK explicitamente - não é seguro assumir que nenhuma linha ficou gravada."
  }

  Write-Host "Teste: 0 PULADO, 0 FALHOU/ERROR, ROLLBACK confirmado."

  # ---------------------------------------------------------------------
  # 4/4 - Consulta de resíduos, em NOVA conexão psql (depois do ROLLBACK
  # acima ter fechado a transação/conexão anterior).
  # ---------------------------------------------------------------------
  $residuoSql = @'
select case when to_regclass('public.empresa_convencao_horas_adicionais') is null
  then 'RESIDUO_GRAVE_TABELA_AUSENTE' else 'TABELA_INTACTA' end;
select count(*)
  from public.empresa_convencao_horas_adicionais
  where percentual_segunda_sexta in (-0.10, 0.30, 0.40, 0.99, 0.20, 0.10, 0.35, 0.11, 0.12)
    and created_at > now() - interval '1 hour';
'@
  $residuoFile = Join-Path $env:TEMP 'legacy_convencao_residuo.sql'
  Set-Content -Path $residuoFile -Value $residuoSql -Encoding utf8 -NoNewline

  $residuoOutput = Invoke-PsqlFileInContainer -LocalPath $residuoFile -Label '4/4 - Consulta de resíduos (nova conexão)'
  $residuoValues = $residuoOutput | Where-Object { $_ -match '^\s*\S' -and $_ -notmatch '^(psql:|NOTICE|--)' }

  if (($residuoOutput -join "`n") -notmatch 'TABELA_INTACTA') {
    throw "FALHOU: a tabela public.empresa_convencao_horas_adicionais não foi encontrada intacta após o teste - RESÍDUO GRAVE."
  }

  $contagemLinha = $residuoOutput | Where-Object { $_ -match '^\s*\d+\s*$' } | Select-Object -Last 1
  if (-not $contagemLinha -or ($contagemLinha.Trim() -ne '0')) {
    throw "FALHOU: resíduo de dados de teste encontrado em public.empresa_convencao_horas_adicionais (contagem = '$($contagemLinha)', esperado 0) - o ROLLBACK não deixou o estado limpo."
  }

  Write-Host "Resíduos: 0 linhas residuais, tabela intacta."
  Write-Host ""
  Write-Host "APROVADO: fixture legada + migration 202608130001 + fase8b_convencao_horas_adicionais_teste.sql - 0 PULADO, 0 FALHOU/ERROR, ROLLBACK confirmado, 0 resíduo."
  Write-Host "Nenhum arquivo em supabase/migrations/, supabase/baseline/, o projeto vinculado ou dados reais foi tocado - só o container Docker local '$ContainerName'."
  Write-Host "Este container agora contém os objetos desta fixture/migration permanentemente - para rodar de novo, recrie o ambiente (`npx supabase stop` + `npx supabase start`, ou um container novo)."
}
finally {
  Pop-Location
}
