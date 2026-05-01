# OpenBida Desktop Build Script for Windows
# This script builds the frontend and packages it into an Electron .exe

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FrontendPath = Join-Path $ProjectRoot "bida-fe"
$BackendPath = $ProjectRoot
$OutputFrontendPath = Join-Path $BackendPath "frontend"
$ReleasePath = Join-Path $BackendPath "release"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  OpenBida Desktop Build Script" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check prerequisites
Write-Host "[1/4] Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js
$nodeVersion = node --version 2>$null
if (-not $nodeVersion) {
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    exit 1
}
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Check npm
$npmVersion = npm --version 2>$null
if (-not $npmVersion) {
    Write-Host "ERROR: npm is not installed or not in PATH" -ForegroundColor Red
    exit 1
}
Write-Host "  npm: $npmVersion" -ForegroundColor Green

# Step 2: Build frontend
Write-Host ""
Write-Host "[2/4] Building frontend (bida-fe)..." -ForegroundColor Yellow

if (-not (Test-Path $FrontendPath)) {
    Write-Host "ERROR: Frontend path not found: $FrontendPath" -ForegroundColor Red
    exit 1
}

Push-Location $FrontendPath

# Install dependencies if node_modules not exists
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

# Build frontend
Write-Host "  Running vite build..." -ForegroundColor Gray
npm run build
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "ERROR: Frontend build failed" -ForegroundColor Red
    exit 1
}

Pop-Location
Write-Host "  Frontend built successfully" -ForegroundColor Green

# Step 3: Copy frontend to backend
Write-Host ""
Write-Host "[3/4] Copying frontend to backend..." -ForegroundColor Yellow

# Remove existing frontend folder
if (Test-Path $OutputFrontendPath) {
    Remove-Item -Recurse -Force $OutputFrontendPath
}

# Create frontend folder
New-Item -ItemType Directory -Path $OutputFrontendPath -Force | Out-Null

# Copy built files
$FrontendDistPath = Join-Path $FrontendPath "dist"
Copy-Item -Path "$FrontendDistPath\*" -Destination $OutputFrontendPath -Recurse
Write-Host "  Frontend copied to: $OutputFrontendPath" -ForegroundColor Green

# Step 4: Build Electron app
Write-Host ""
Write-Host "[4/4] Building Electron application..." -ForegroundColor Yellow

Push-Location $BackendPath

# Ensure release folder exists
if (-not (Test-Path $ReleasePath)) {
    New-Item -ItemType Directory -Path $ReleasePath -Force | Out-Null
}

# Run electron-builder
Write-Host "  Running electron-builder..." -ForegroundColor Gray
npm run build:desktop
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Write-Host "ERROR: Electron build failed" -ForegroundColor Red
    exit 1
}

Pop-Location

# Step 5: Show results
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output files:" -ForegroundColor White

if (Test-Path $ReleasePath) {
    Get-ChildItem $ReleasePath -Filter "*.exe" | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.FullName) ($size MB)" -ForegroundColor Cyan
    }
}

Write-Host ""
Write-Host "Installation options:" -ForegroundColor White
Write-Host "  - Portable: Just double-click the .exe to run" -ForegroundColor Gray
Write-Host "  - Installer: Run the setup.exe to install" -ForegroundColor Gray
Write-Host ""
