# Builds and starts the stack tagging the images with the version from package.json.
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:CELL_VERSION = (Get-Content -Raw package.json | ConvertFrom-Json).version
Write-Host "Publicando Cell v$env:CELL_VERSION"
docker compose up -d --build --wait
if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar os containers.' }
Write-Host "Cell v$env:CELL_VERSION no ar."
