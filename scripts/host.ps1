# Installs the Cell Host: lets agents run commands on this computer (each command needs your approval in Cell).
# Runs at logon as you, without administrator rights, listening on 127.0.0.1 only. Needs Node.js 22+.
#   .\scripts\host.ps1           install or update, then restart Cell with .\scripts\deploy.ps1
#   .\scripts\host.ps1 -Remove   uninstall (and remove the token from .env)
param([switch]$Remove, [int]$Port = 47821)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$task = 'Cell Host'
$dir = Join-Path $env:LOCALAPPDATA 'Cell'
$config = Join-Path $dir 'host.json'

function Set-EnvValue([string]$Name, [string]$Value) {
    $lines = @(if (Test-Path .env) { Get-Content .env | Where-Object { $_ -notmatch "^$Name=" } })
    if ($Value) { $lines += "$Name=$Value" }
    [IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), (($lines -join "`n") + "`n"))
}

Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
if ($Remove) {
    Remove-Item $config -ErrorAction SilentlyContinue
    Set-EnvValue 'CELL_HOST_URL' ''; Set-EnvValue 'CELL_HOST_TOKEN' ''
    Write-Host 'Cell Host removido. Rode .\scripts\deploy.ps1 para o Cell parar de oferecer os comandos.'
    return
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Node.js nao encontrado. Instale o Node.js 22 ou mais novo (nodejs.org) e rode de novo.' }
if ([int]((& $node --version).TrimStart('v').Split('.')[0]) -lt 22) { throw 'O Cell Host precisa do Node.js 22 ou mais novo.' }

New-Item -ItemType Directory -Force -Path $dir | Out-Null
$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = ([BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
[IO.File]::WriteAllText($config, (@{ port = $Port; token = $token } | ConvertTo-Json))
# Only this user may read the token.
icacls $config /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null

$script = (Resolve-Path 'host\cell-host.mjs').Path
# conhost --headless runs the console program without a window.
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless `"$node`" `"$script`"" -WorkingDirectory (Get-Location).Path
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Cell: comandos aprovados no computador' | Out-Null
Start-ScheduledTask -TaskName $task

Set-EnvValue 'CELL_HOST_URL' "http://host.docker.internal:$Port"
Set-EnvValue 'CELL_HOST_TOKEN' $token
Start-Sleep -Seconds 2
try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status" -Headers @{ Authorization = "Bearer $token" } | Out-Null; Write-Host 'Cell Host instalado e rodando.' }
catch { Write-Warning "O Cell Host nao respondeu. Veja $dir\host.log." }
Write-Host 'Rode .\scripts\deploy.ps1 para o Cell passar a usar o computador.'
