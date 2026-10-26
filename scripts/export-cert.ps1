param([string]$Destination = 'cell-root.crt')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
docker compose cp web:/data/caddy/pki/authorities/local/root.crt $Destination
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel exportar o certificado.' }
Write-Host "Certificado exportado para $Destination. Instale apenas nos dispositivos que acessarao este servidor Cell."
