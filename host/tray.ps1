# Cell Host tray: starts host\cell-host.mjs hidden, shows an icon in the Windows notification area and lets you start,
# stop or quit it. Restarts the host if it crashes while it should be running. Launched at logon by the "Cell Host"
# task (scripts/host.ps1) or from the Start menu shortcut; a second copy just shows a notice and exits.
param([string]$Node = (Get-Command node).Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$mutex = New-Object Threading.Mutex($false, 'Local\CellHostTray')
if (-not $mutex.WaitOne(0)) { [Windows.Forms.MessageBox]::Show('O Cell Host já está rodando. Procure o ícone na bandeja, perto do relógio.', 'Cell Host') | Out-Null; return }

$root = Split-Path $PSScriptRoot -Parent
$script = Join-Path $PSScriptRoot 'cell-host.mjs'
$logDir = Join-Path $env:LOCALAPPDATA 'Cell'
$log = Join-Path $logDir 'host.log'
$config = Get-Content (Join-Path $logDir 'host.json') -Raw | ConvertFrom-Json
$appUrl = (Get-Content (Join-Path $root '.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^APP_ORIGIN=' } | Select-Object -First 1) -replace '^APP_ORIGIN=', '' -split ',' | Select-Object -First 1
if (-not $appUrl) { $appUrl = 'https://localhost' }

# Cell icon, plus a gray copy for "stopped".
$png = [Drawing.Image]::FromFile((Join-Path $root 'apps\web\public\icon-192.png'))
function New-TrayIcon([bool]$Running) {
    $bmp = New-Object Drawing.Bitmap 32, 32
    $g = [Drawing.Graphics]::FromImage($bmp); $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'
    if ($Running) { $g.DrawImage($png, 0, 0, 32, 32) }
    else {
        $matrix = New-Object Drawing.Imaging.ColorMatrix (,[single[][]]@(@(.3,.3,.3,0,0),@(.59,.59,.59,0,0),@(.11,.11,.11,0,0),@(0,0,0,.55,0),@(0,0,0,0,1)))
        $attrs = New-Object Drawing.Imaging.ImageAttributes; $attrs.SetColorMatrix($matrix)
        $g.DrawImage($png, (New-Object Drawing.Rectangle 0, 0, 32, 32), 0, 0, $png.Width, $png.Height, 'Pixel', $attrs)
    }
    $dot = if ($Running) { [Drawing.Color]::FromArgb(24, 185, 156) } else { [Drawing.Color]::FromArgb(150, 150, 150) }
    $g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::White)), 19, 19, 13, 13)
    $g.FillEllipse((New-Object Drawing.SolidBrush $dot), 21, 21, 9, 9)
    $g.Dispose(); return [Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$iconOn = New-TrayIcon $true; $iconOff = New-TrayIcon $false

$state = @{ Process = $null; Wanted = $true; Failures = 0 }
function Test-Port { try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', [int]$config.port); $c.Close(); $true } catch { $false } }
function Start-Host {
    $state.Wanted = $true
    if ($state.Process -and -not $state.Process.HasExited) { return }
    $state.Process = Start-Process -FilePath $Node -ArgumentList "`"$script`"" -WorkingDirectory $root -WindowStyle Hidden -PassThru
}
function Stop-Host {
    $state.Wanted = $false
    if ($state.Process -and -not $state.Process.HasExited) { & taskkill /PID $state.Process.Id /T /F | Out-Null }
    $state.Process = $null
}

$tray = New-Object Windows.Forms.NotifyIcon
$menu = New-Object Windows.Forms.ContextMenuStrip
$status = $menu.Items.Add('Cell Host'); $status.Enabled = $false
[void]$menu.Items.Add('-')
$startItem = $menu.Items.Add('Iniciar')
$stopItem = $menu.Items.Add('Parar')
[void]$menu.Items.Add('-')
$openItem = $menu.Items.Add('Abrir o Cell')
$logItem = $menu.Items.Add('Ver registro')
[void]$menu.Items.Add('-')
$quitItem = $menu.Items.Add('Fechar (parar e sair)')
$tray.ContextMenuStrip = $menu

function Update-Tray {
    $running = $state.Process -and -not $state.Process.HasExited
    $text = if ($running) { 'Cell Host: rodando' } elseif ($state.Wanted) { 'Cell Host: iniciando…' } else { 'Cell Host: parado' }
    $status.Text = $text; $tray.Text = $text
    $tray.Icon = if ($running) { $iconOn } else { $iconOff }
    $startItem.Enabled = -not $running; $stopItem.Enabled = [bool]$running
}

$startItem.add_Click({ $state.Failures = 0; Start-Host; Update-Tray; $tray.ShowBalloonTip(2000, 'Cell Host', 'Iniciado. Os agentes podem pedir comandos (sempre com sua aprovação).', 'Info') })
$stopItem.add_Click({ Stop-Host; Update-Tray; $tray.ShowBalloonTip(2000, 'Cell Host', 'Parado. Os agentes não conseguem rodar comandos até você iniciar de novo.', 'Info') })
$openItem.add_Click({ Start-Process $appUrl })
$logItem.add_Click({ if (Test-Path $log) { Start-Process notepad.exe $log } })
$quitItem.add_Click({ Stop-Host; $tray.Visible = $false; [Windows.Forms.Application]::Exit() })
# Double-click: start when stopped, otherwise show the menu.
$tray.add_MouseDoubleClick({ if (-not ($state.Process -and -not $state.Process.HasExited)) { $startItem.PerformClick() } })

# Watchdog: restart the host if it exits while it should be running (backing off after repeated failures).
$timer = New-Object Windows.Forms.Timer; $timer.Interval = 3000
$timer.add_Tick({
    if ($state.Wanted -and (-not $state.Process -or $state.Process.HasExited)) {
        $state.Failures++
        if ($state.Failures -le 5) { Start-Host }
        elseif ($state.Failures -eq 6) { $state.Wanted = $false; $tray.ShowBalloonTip(5000, 'Cell Host', "O Cell Host parou várias vezes. Veja o registro ($log) e use Iniciar.", 'Warning') }
    } elseif ($state.Process -and -not $state.Process.HasExited -and (Test-Port)) { $state.Failures = 0 }
    Update-Tray
})

Start-Host; Update-Tray
$tray.Visible = $true
$timer.Start()
[Windows.Forms.Application]::Run()
$timer.Stop(); $tray.Dispose(); $mutex.ReleaseMutex()
