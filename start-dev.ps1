# Starts PrepMind for local development: database (Docker), backend (FastAPI :8000), frontend (Vite :5173).
# Run from PowerShell:   cd C:\prepmindAI-frontend\PrepMind ; .\start-dev.ps1
# (If scripts are blocked:  powershell -ExecutionPolicy Bypass -File .\start-dev.ps1)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# To run everything in Docker instead (no hot reload):  docker compose up -d --build
# Free ports 8000/5173 if the Docker backend/frontend are running (no-op when Docker is off).
docker compose -f (Join-Path $root "docker-compose.yml") stop backend frontend *> $null

# A second copy would grab other ports (Google sign-in and email links only work on 5173).
foreach ($port in 8000, 5173) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "Port $port is already in use - PrepMind may already be running. Close the 'PrepMind backend' / 'PrepMind frontend' windows first."
    }
}

# 1. Docker Desktop must be running for the pgvector database.
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting Docker Desktop..." -ForegroundColor Cyan
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 3
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { break }
    }
    if ($LASTEXITCODE -ne 0) { throw "Docker Desktop did not start. Open it manually and run this script again." }
}

# 2. Database container (PostgreSQL + pgvector on port 5433).
Write-Host "Starting database..." -ForegroundColor Cyan
Push-Location $root
# Only the database: the dev servers below replace the backend/frontend containers.
docker compose up -d db
Pop-Location
for ($i = 0; $i -lt 30; $i++) {
    docker exec prepmind-db pg_isready -U postgres -d prepmind *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
}

# 3. Backend and frontend, each in its own window so you can watch their logs (Ctrl+C there to stop).
Write-Host "Starting backend on http://localhost:8000 ..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory $root -ArgumentList "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'PrepMind backend'; `$env:PYTHONIOENCODING = 'utf-8'; .\myvenv\Scripts\python.exe -m uvicorn backend.server:app --port 8000 --reload --reload-dir backend"

Write-Host "Starting frontend on http://localhost:5173 ..." -ForegroundColor Cyan
Start-Process powershell -WorkingDirectory (Join-Path $root "frontend") -ArgumentList "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'PrepMind frontend'; npm run dev -- --port 5173 --strictPort"

Write-Host ""
Write-Host "PrepMind is starting. Open http://localhost:5173 in a few seconds." -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs"
