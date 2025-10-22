@echo off
setlocal enabledelayedexpansion

set "REPO_URL=https://github.com/JeremyTCD/MapTool.git"
set "APP_DIR=%~dp0maptool-app"
set "PRIMARY_PORT=5173"
set "FALLBACK_PORT=8010"
set "DID_PUSH=0"

if not exist "%APP_DIR%" (
    mkdir "%APP_DIR%" >nul 2>nul
)

where git >nul 2>nul
if errorlevel 1 (
    echo Git is required but was not found in PATH.
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo Node.js (npm) is required but was not found in PATH.
    exit /b 1
)

where wasm-pack >nul 2>nul
if errorlevel 1 (
    echo wasm-pack is required but was not found in PATH.
    echo Install it from https://rustwasm.github.io/wasm-pack/installer/ and retry.
    exit /b 1
)

if exist "%APP_DIR%\.git" (
    pushd "%APP_DIR%"
    set "DID_PUSH=1"
    echo Updating existing MapTool checkout...
    git fetch --tags --prune
    if errorlevel 1 goto :fail
    git checkout main >nul 2>nul
    if errorlevel 1 goto :fail
    git pull --ff-only
    if errorlevel 1 goto :fail
) else (
    echo Downloading the latest MapTool sources...
    git clone "%REPO_URL%" "%APP_DIR%"
    if errorlevel 1 (
        echo Failed to clone repository from %REPO_URL%.
        exit /b 1
    )
    pushd "%APP_DIR%"
    set "DID_PUSH=1"
)

echo Installing npm dependencies...
call npm install
if errorlevel 1 goto :fail

echo Building WebAssembly package...
call npm run wasm
if errorlevel 1 goto :fail

echo Starting MapTool on port %PRIMARY_PORT% (fallback %FALLBACK_PORT%)...
call npm run dev -- --host --port %PRIMARY_PORT% --strictPort
if errorlevel 1 (
    echo Port %PRIMARY_PORT% unavailable, retrying on %FALLBACK_PORT%...
    call npm run dev -- --host --port %FALLBACK_PORT% --strictPort
    if errorlevel 1 goto :fail
)

goto :cleanup

:fail
echo.
echo An error occurred. See messages above for details.

:cleanup
if "%DID_PUSH%"=="1" popd
endlocal
exit /b %ERRORLEVEL%
