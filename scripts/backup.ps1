param([string]$Destination = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $Destination) { $Destination = Join-Path (Get-Location) ('backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
$target = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $target) { throw 'Destino ja existe. Escolha uma pasta nova.' }
New-Item -ItemType Directory -Path $target | Out-Null
function Invoke-Checked { param([string[]]$DockerArgs) & docker @DockerArgs; if ($LASTEXITCODE -ne 0) { throw 'Falha ao executar etapa do backup.' } }
try {
    Invoke-Checked @('compose','stop','web','worker','api')
    Invoke-Checked @('compose','exec','-T','db','pg_dump','-U','cell','-d','cell','-Fc','-f','/tmp/cell-backup.dump')
    Invoke-Checked @('compose','cp','db:/tmp/cell-backup.dump',(Join-Path $target 'database.dump'))
    # The stopped API container still exposes its volume through docker cp.
    Invoke-Checked @('compose','cp','api:/data/files',(Join-Path $target 'files'))
    [IO.File]::WriteAllText((Join-Path $target 'manifest.json'), (@{ version=1; createdAt=(Get-Date).ToUniversalTime().ToString('o'); requiresOriginalSecretKey=$true } | ConvertTo-Json))
    Write-Host "Backup concluido: $target. Guarde o .env separadamente em local seguro."
} finally { docker compose start api worker web }
