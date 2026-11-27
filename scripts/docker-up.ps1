$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$envPath = Join-Path $projectRoot '.env'
$examplePath = Join-Path $projectRoot '.env.example'

if (-not (Test-Path $envPath)) {
    Copy-Item $examplePath $envPath
    Write-Host '[KRESNA] Created .env from .env.example' -ForegroundColor Cyan
}

$envText = [System.IO.File]::ReadAllText($envPath)
$keyLine = [regex]::Match($envText, '(?m)^KRESNA_ENCRYPTION_KEY=(.*)$')
if (-not $keyLine.Success -or [string]::IsNullOrWhiteSpace($keyLine.Groups[1].Value)) {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $key = ([System.BitConverter]::ToString($bytes)).Replace('-', '')

    if ($keyLine.Success) {
        $envText = [regex]::Replace($envText, '(?m)^KRESNA_ENCRYPTION_KEY=.*$', "KRESNA_ENCRYPTION_KEY=$key")
    } else {
        $envText = $envText.TrimEnd() + "`r`nKRESNA_ENCRYPTION_KEY=$key`r`n"
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($envPath, $envText, $utf8NoBom)
    Write-Host '[KRESNA] Generated a persistent local encryption key in .env' -ForegroundColor Green
}

Write-Host '[KRESNA] Building and starting Docker Compose stack...' -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Compose failed. Run: docker compose logs --tail 150 kresna'
}

docker compose ps
Write-Host '[KRESNA] Waiting for application health...' -ForegroundColor Cyan
$healthy = $false
for ($i = 1; $i -le 45; $i++) {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 3
        if ($health.ok -eq $true) {
            $healthy = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $healthy) {
    docker compose logs --tail 100 kresna
    throw 'KRESNA did not become healthy. Review the logs above.'
}

Write-Host ''
Write-Host 'KRESNA is ready: http://127.0.0.1:3000' -ForegroundColor Green
Write-Host 'Local admin mode is enabled; no registration or sign-in is required.' -ForegroundColor Yellow
Start-Process 'http://127.0.0.1:3000'
