# Installs the Cell Host: lets agents run commands on this computer (each command needs your approval in Cell).
# Runs at logon as you, without administrator rights, listening on 127.0.0.1 only, with an icon in the notification
# area (start, stop, quit) and a "Cell Host" Start menu shortcut to open it again. Needs Node.js 22+.
#   .\scripts\host.ps1           install or update, then restart Cell with .\scripts\deploy.ps1
#   .\scripts\host.ps1 -Remove   uninstall (and remove the token from .env)
param([switch]$Remove, [int]$Port = 47821)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$task = 'Cell Host'
$dir = Join-Path $env:LOCALAPPDATA 'Cell'
$config = Join-Path $dir 'host.json'
$shortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Cell Host.lnk'

function Set-EnvValue([string]$Name, [string]$Value) {
    $lines = @(if (Test-Path .env) { Get-Content .env | Where-Object { $_ -notmatch "^$Name=" } })
    if ($Value) { $lines += "$Name=$Value" }
    [IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), (($lines -join "`n") + "`n"))
}

Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue
# Stop a running tray and host (older installs started the host directly).
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cell-host\.mjs|tray\.ps1' -and $_.ProcessId -ne $PID } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
if ($Remove) {
    Remove-Item $config, $shortcut, (Join-Path $dir 'cell.ico') -ErrorAction SilentlyContinue
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

$tray = (Resolve-Path 'host\tray.ps1').Path
# conhost --headless hides the PowerShell console; the tray icon is the only thing on screen.
$launch = "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File `"$tray`" -Node `"$node`""
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $launch -WorkingDirectory (Get-Location).Path
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $task -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Cell: comandos aprovados no computador' | Out-Null
Start-ScheduledTask -TaskName $task

# Start menu shortcut with the Cell icon, to bring the tray back after closing it.
Add-Type -AssemblyName System.Drawing
$ico = Join-Path $dir 'cell.ico'
$bmp = New-Object Drawing.Bitmap ([Drawing.Image]::FromFile((Resolve-Path 'apps\web\public\icon-192.png').Path)), 64, 64
$stream = [IO.File]::Create($ico); [Drawing.Icon]::FromHandle($bmp.GetHicon()).Save($stream); $stream.Close()
$link = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut)
$link.TargetPath = 'conhost.exe'; $link.Arguments = $launch; $link.WorkingDirectory = (Get-Location).Path
$link.IconLocation = $ico; $link.Description = 'Cell Host: comandos aprovados no computador'; $link.Save()

Set-EnvValue 'CELL_HOST_URL' "http://host.docker.internal:$Port"
Set-EnvValue 'CELL_HOST_TOKEN' $token
Start-Sleep -Seconds 4
try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status" -Headers @{ Authorization = "Bearer $token" } | Out-Null; Write-Host 'Cell Host instalado e rodando (icone na bandeja, perto do relogio).' }
catch { Write-Warning "O Cell Host nao respondeu. Veja $dir\host.log." }
Write-Host 'Rode .\scripts\deploy.ps1 para o Cell passar a usar o computador.'
