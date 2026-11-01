$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path -LiteralPath '.env')) {
    $portalBytes = New-Object byte[] 24
    $portalRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $portalRng.GetBytes($portalBytes)
    $portalRng.Dispose()
    $portalPassword = [BitConverter]::ToString($portalBytes).Replace('-', '').ToLowerInvariant()
    $portalConfig = "POSTGRES_PASSWORD=$portalPassword`nDATABASE_URL=postgresql://arquimetria:$portalPassword@127.0.0.1:55437/arquimetria_portal`nPORT=4173`n"
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $portalConfig)
    Write-Host 'Credenciais locais geradas em .env (não incluídas no Git/ZIP).'
}
docker compose up -d --wait db
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o PostgreSQL local.' }
Write-Host 'PostgreSQL pronto. Inicie o portal com cargo run.'
