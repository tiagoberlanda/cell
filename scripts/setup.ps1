param([string]$HostName = 'localhost', [string]$Username = 'cell')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function New-Hex([int]$Length) { $bytes = New-Object byte[] $Length; $rng = [Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose(); return ([BitConverter]::ToString($bytes)).Replace('-','').ToLower() }
# -HostName aceita varios hosts separados por virgula, ex.: '192.168.0.10,localhost'.
$hosts = @($HostName.Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if (-not (Test-Path -LiteralPath '.env')) {
    $secret = New-Hex 32
    $dbPassword = New-Hex 24
    $content = @"
POSTGRES_PASSWORD=$dbPassword
SECRET_KEY=$secret
NINEROUTER_BASE_URL=http://host.docker.internal:20128/v1
NINEROUTER_API_KEY=
NINEROUTER_DEFAULT_MODEL=
CELL_HOST=$($hosts -join ', ')
CELL_DEFAULT_SNI=$($hosts[0])
APP_ORIGIN=$(($hosts | ForEach-Object { "https://$_" }) -join ',')
COOKIE_SECURE=true
"@
    [IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $content)
    Write-Host '.env criado com segredos aleatorios. Configure o token 9router pela interface ou no arquivo.'
}
$env:CELL_VERSION = (Get-Content -Raw package.json | ConvertFrom-Json).version
docker compose up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar os containers.' }
# Prompt via Write-Host: Read-Host with a prompt rejects input starting with '!' as a prompt command.
Write-Host 'Senha inicial (minimo 12 caracteres): ' -NoNewline
$secure = Read-Host -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:CELL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    $Username | docker compose exec -T -e CELL_ADMIN_PASSWORD api npm run admin
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel configurar a conta. Para conta existente use o procedimento de reset do README.' }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Item Env:CELL_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
Write-Host "Cell pronto em https://$($hosts[0]). Exporte e instale o certificado local conforme o README."
