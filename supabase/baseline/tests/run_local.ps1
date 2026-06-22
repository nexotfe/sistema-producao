param(
  [ValidateRange(1, 15)]
  [int]$MaxModule = 3,

  [ValidatePattern('^nexotfe_baseline_test_[a-z0-9_]+$')]
  [string]$DatabaseName = 'nexotfe_baseline_test_local',

  [int]$Port = 55432,

  [string]$DataDirectory = '.local-postgres/data'
)

$ErrorActionPreference = 'Stop'

function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory)]
    [string]$Command,

    [Parameter(Mandatory)]
    [string[]]$ArgumentList
  )

  & $Command @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Comando falhou ($LASTEXITCODE): $Command $($ArgumentList -join ' ')"
  }
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '../../..')).Path
$data = (Resolve-Path (Join-Path $workspace $DataDirectory)).Path
$serverStartedHere = $false
$postgresProcess = $null

Push-Location $workspace
try {
  & pg_isready -h 127.0.0.1 -p $Port -U postgres *> $null
  if ($LASTEXITCODE -ne 0) {
    $postgres = (Get-Command postgres.exe).Source
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $postgres
    $startInfo.Arguments = "-D `"$data`" -p $Port -h 127.0.0.1"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $postgresProcess = [System.Diagnostics.Process]::Start($startInfo)
    $serverStartedHere = $true

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      & pg_isready -h 127.0.0.1 -p $Port -U postgres *> $null
      if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
      }
      Start-Sleep -Milliseconds 500
    }

    if (-not $ready) {
      throw 'PostgreSQL local não ficou disponível.'
    }
  }

  $env:PGHOST = '127.0.0.1'
  $env:PGPORT = $Port.ToString()
  $env:PGUSER = 'postgres'

  Invoke-NativeChecked -Command dropdb -ArgumentList @('--if-exists', $DatabaseName)
  Invoke-NativeChecked -Command createdb -ArgumentList @($DatabaseName)

  Invoke-NativeChecked -Command psql -ArgumentList @(
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', $DatabaseName,
    '-f', 'supabase/baseline/tests/000_supabase_test_bootstrap.sql'
  )

  $baselineFiles = Get-ChildItem 'supabase/baseline' -File -Filter '*.sql' |
    Where-Object {
      $_.BaseName -match '^(?<number>\d{3})_' -and
      [int]$Matches.number -le $MaxModule
    } |
    Sort-Object Name

  foreach ($file in $baselineFiles) {
    Write-Host "Baseline: $($file.Name)"
    Invoke-NativeChecked -Command psql -ArgumentList @(
      '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', $DatabaseName, '-f', $file.FullName
    )
  }

  $testFiles = Get-ChildItem 'supabase/baseline/tests' -File -Filter '*_test.sql' |
    Where-Object {
      $_.BaseName -match '^(?<number>\d{3})_' -and
      [int]$Matches.number -ge 1 -and
      [int]$Matches.number -le $MaxModule
    } |
    Sort-Object Name

  foreach ($file in $testFiles) {
    Write-Host "Teste: $($file.Name)"
    Invoke-NativeChecked -Command psql -ArgumentList @(
      '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-d', $DatabaseName, '-f', $file.FullName
    )
  }

  Write-Host "Baseline 001..$('{0:D3}' -f $MaxModule): APROVADO"
}
finally {
  & dropdb --if-exists $DatabaseName *> $null

  if ($serverStartedHere -and $postgresProcess -and -not $postgresProcess.HasExited) {
    & pg_ctl stop -D $data -m fast -w *> $null
    if ($LASTEXITCODE -ne 0 -and -not $postgresProcess.HasExited) {
      $postgresProcess.Kill()
      $postgresProcess.WaitForExit()
    }
  }

  Pop-Location
}
