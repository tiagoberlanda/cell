param([Parameter(Mandatory=$true)][string]$Backup)
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $Backup).Path
if (-not (Test-Path -LiteralPath (Join-Path $source 'database.dump')) -or -not (Test-Path -LiteralPath (Join-Path $source 'files'))) { throw 'Backup incompleto.' }
Set-Location (Split-Path $PSScriptRoot -Parent)
if ((Read-Host 'A restauracao substitui o banco atual. Digite RESTAURAR para continuar') -cne 'RESTAURAR') { throw 'Restauracao cancelada.' }
function Invoke-Checked { param([string[]]$DockerArgs) & docker @DockerArgs; if ($LASTEXITCODE -ne 0) { throw 'Falha ao restaurar. Servicos permanecem parados para revisao.' } }
Invoke-Checked @('compose','stop','web','worker','api')
Invoke-Checked @('compose','cp',(Join-Path $source 'database.dump'),'db:/tmp/cell-restore.dump')
Invoke-Checked @('compose','exec','-T','db','pg_restore','-U','cell','-d','cell','--clean','--if-exists','--no-owner','--exit-on-error','/tmp/cell-restore.dump')
Invoke-Checked @('compose','cp',(Join-Path $source 'files'),'api:/data/')
# External operations interrupted during a backup need human review after recovery.
Invoke-Checked @('compose','exec','-T','db','psql','-U','cell','-d','cell','-c',"UPDATE runs SET state='queued' WHERE state='running'; DELETE FROM sessions;")
Invoke-Checked @('compose','start','api','worker','web')
Write-Host 'Restauracao concluida. Use a mesma SECRET_KEY do backup. Entre novamente.'
