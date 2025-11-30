# Quick build script - faster production build for testing
# Skips installer creation and uses faster optimization

Write-Host "=== Quick Production Build (Testing) ===" -ForegroundColor Cyan
Write-Host "This build skips installers for faster compilation" -ForegroundColor Yellow
Write-Host ""

# Check for running instances
Write-Host "Checking for running instances..." -ForegroundColor Yellow
$processes = Get-Process | Where-Object { 
    $_.ProcessName -like "*max-desktop*" -or 
    $_.ProcessName -like "*MAX Desktop*" -or
    $_.MainWindowTitle -like "*MAX Desktop*"
}

if ($processes) {
    Write-Host "Found running instances. Stopping them..." -ForegroundColor Yellow
    foreach ($process in $processes) {
        try {
            Stop-Process -Id $process.Id -Force -ErrorAction Stop
        } catch {
            Write-Host "Warning: Could not stop process $($process.ProcessName)" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 2
}

# Clean up old executable
$targetExe = "src-tauri\target\release\MAX Desktop.exe"
if (Test-Path $targetExe) {
    try {
        Remove-Item $targetExe -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "Warning: Could not remove existing executable" -ForegroundColor Yellow
    }
}

# Check Node.js
Write-Host "Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found" -ForegroundColor Red
    exit 1
}

# Check backend dependencies
Write-Host "Checking backend dependencies..." -ForegroundColor Yellow
$backendPath = "backend"
if (Test-Path $backendPath) {
    $nodeModulesPath = Join-Path $backendPath "node_modules"
    if (-not (Test-Path $nodeModulesPath)) {
        Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
        Push-Location $backendPath
        npm install
        Pop-Location
    }
}

Write-Host ""
Write-Host "Starting quick build..." -ForegroundColor Green
Write-Host ""

