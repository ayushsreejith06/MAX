# Pre-build script to ensure no running instances block the build
Write-Host "Checking for running instances of MAX Desktop..." -ForegroundColor Yellow

# Check for both possible process names
$processes = Get-Process | Where-Object { 
    $_.ProcessName -like "*max-desktop*" -or 
    $_.ProcessName -like "*MAX Desktop*" -or
    $_.MainWindowTitle -like "*MAX Desktop*"
}

if ($processes) {
    Write-Host "Found running instances. Stopping them..." -ForegroundColor Yellow
    foreach ($process in $processes) {
        try {
            Write-Host "Stopping process: $($process.ProcessName) (PID: $($process.Id))" -ForegroundColor Yellow
            Stop-Process -Id $process.Id -Force -ErrorAction Stop
        } catch {
            Write-Host "Warning: Could not stop process $($process.ProcessName): $_" -ForegroundColor Red
        }
    }
    
    # Wait a moment for file handles to be released
    Write-Host "Waiting for file handles to be released..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2
} else {
    Write-Host "No running instances found." -ForegroundColor Green
}

# Also check if the target file exists and try to remove it if it's locked
$targetExe = "src-tauri\target\release\MAX Desktop.exe"
if (Test-Path $targetExe) {
    try {
        # Try to remove the file if it exists
        Remove-Item $targetExe -Force -ErrorAction SilentlyContinue
        Write-Host "Cleaned up existing executable." -ForegroundColor Green
    } catch {
        Write-Host "Warning: Could not remove existing executable. It may be locked." -ForegroundColor Yellow
    }
}

# Ensure backend dependencies are installed
Write-Host "Checking backend dependencies..." -ForegroundColor Yellow
$backendPath = "backend"
if (Test-Path $backendPath) {
    $nodeModulesPath = Join-Path $backendPath "node_modules"
    if (-not (Test-Path $nodeModulesPath)) {
        Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
        Push-Location $backendPath
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Warning: Failed to install backend dependencies. Build may fail." -ForegroundColor Red
        } else {
            Write-Host "Backend dependencies installed successfully." -ForegroundColor Green
        }
        Pop-Location
    } else {
        Write-Host "Backend dependencies already installed." -ForegroundColor Green
    }
} else {
    Write-Host "Warning: Backend folder not found at $backendPath" -ForegroundColor Red
}

# Check if Node.js is available
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version
    Write-Host "Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found in PATH. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

Write-Host "Pre-build checks complete." -ForegroundColor Green

