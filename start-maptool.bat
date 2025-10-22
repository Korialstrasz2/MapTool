@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "REPO_URL=https://github.com/JeremyTCD/MapTool.git"
set "APP_DIR=%SCRIPT_DIR%maptool-app"
set "PRIMARY_PORT=5173"
set "FALLBACK_PORT=8010"
set "DID_PUSH=0"
set "LOG_FILE=%SCRIPT_DIR%start-maptool.log"

if exist "%LOG_FILE%" del "%LOG_FILE%" >nul 2>nul

call :log "Starting MapTool bootstrap script."
call :log "Log file: %LOG_FILE%"
call :log "System PATH: %PATH%"

if not exist "%APP_DIR%" (
    call :log "Creating application directory at %APP_DIR%..."
    mkdir "%APP_DIR%" >nul 2>nul
)

call :log "Checking required dependencies..."
call :ensure_dependency git "Git is required but was not found in PATH."
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('git --version 2^>nul') do call :log "git version: %%I"
call :ensure_dependency npm "Node.js (npm) is required but was not found in PATH."
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('npm --version 2^>nul') do call :log "npm version: %%I"
call :locate_python
if errorlevel 1 (
    call :log "Python is required to create a virtual environment but was not found in PATH."
    goto :fail
)
call :log "Python located at %PYTHON_CMD%."
for /f "delims=" %%I in ('"%PYTHON_CMD%" --version 2^>&1') do call :log "Python version: %%I"
call :log "Dependency check completed."

if exist "%APP_DIR%\.git" (
    pushd "%APP_DIR%"
    set "DID_PUSH=1"
    call :log "Updating existing MapTool checkout..."
    git fetch --tags --prune >> "%LOG_FILE%" 2>&1
    if errorlevel 1 goto :fail
    git checkout main >> "%LOG_FILE%" 2>&1
    if errorlevel 1 goto :fail
    git pull --ff-only >> "%LOG_FILE%" 2>&1
    if errorlevel 1 goto :fail
) else (
    call :log "Downloading the latest MapTool sources..."
    git clone "%REPO_URL%" "%APP_DIR%" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        call :log "Failed to clone repository from %REPO_URL%."
        goto :fail
    )
    pushd "%APP_DIR%"
    set "DID_PUSH=1"
)

call :ensure_virtualenv
if errorlevel 1 goto :fail

call :log "Installing npm dependencies (this may take a moment)..."
call npm install >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail
call :log "npm dependencies installed successfully."

call :ensure_wasm_pack
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('"%WASM_PACK%" --version 2^>nul') do call :log "wasm-pack version: %%I"

call :log "Building WebAssembly package..."
call npm run wasm >> "%LOG_FILE%" 2>&1
if errorlevel 1 goto :fail
call :log "WebAssembly package built successfully."

call :log "Starting MapTool on port %PRIMARY_PORT% (fallback %FALLBACK_PORT%)..."
call npm run dev -- --host --port %PRIMARY_PORT% --strictPort >> "%LOG_FILE%" 2>&1
if errorlevel 1 (
    call :log "Port %PRIMARY_PORT% unavailable, retrying on %FALLBACK_PORT%..."
    call npm run dev -- --host --port %FALLBACK_PORT% --strictPort >> "%LOG_FILE%" 2>&1
    if errorlevel 1 goto :fail
)
call :log "Development server is running. Output is being written to %LOG_FILE%."
goto :cleanup

:fail
set "FAILURE_CODE=%ERRORLEVEL%"
call :log ""
call :log "An error occurred (exit code %FAILURE_CODE%). Review %LOG_FILE% for details."
goto :cleanup

:cleanup
if "%DID_PUSH%"=="1" popd
call :log ""
call :log "Detailed log saved to %LOG_FILE%."
endlocal
exit /b %ERRORLEVEL%

:ensure_dependency
set "TOOL=%~1"
set "MESSAGE=%~2"
for /f "delims=" %%I in ('where %TOOL% 2^>nul') do (
    call :log "%TOOL% located at %%~I"
    exit /b 0
)
call :log "%MESSAGE%"
exit /b 1

:locate_python
for /f "delims=" %%I in ('where python 2^>nul') do (
    set "PYTHON_CMD=%%~I"
    goto :locate_python_success
)
for /f "delims=" %%I in ('where py 2^>nul') do (
    set "PYTHON_CMD=%%~I"
    goto :locate_python_success
)
exit /b 1
:locate_python_success
exit /b 0

:ensure_wasm_pack
set "WASM_PACK_CMD="
for /f "delims=" %%I in ('where wasm-pack 2^>nul') do (
    set "WASM_PACK_CMD=%%~I"
    goto :ensure_wasm_pack_found
)
for %%F in ("%APP_DIR%\node_modules\.bin\wasm-pack.cmd" "%APP_DIR%\node_modules\.bin\wasm-pack.exe" "%APP_DIR%\node_modules\.bin\wasm-pack.ps1") do (
    if exist %%~F (
        set "WASM_PACK_CMD=%%~fF"
        goto :ensure_wasm_pack_found
    )
)
call :log "wasm-pack CLI not found. Install it by running `npm install wasm-pack --save-dev` in %APP_DIR% or add it to your PATH."
exit /b 1
:ensure_wasm_pack_found
call :log "wasm-pack located at !WASM_PACK_CMD!"
set "PATH=%APP_DIR%\node_modules\.bin;%PATH%"
set "WASM_PACK=!WASM_PACK_CMD!"
exit /b 0

:ensure_virtualenv
set "VENV_DIR=%APP_DIR%\venv"
if exist "%VENV_DIR%\Scripts\python.exe" (
    call :log "Using existing Python virtual environment at %VENV_DIR%."
) else (
    call :log "Creating Python virtual environment at %VENV_DIR%..."
    "%PYTHON_CMD%" -m venv "%VENV_DIR%" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        call :log "Failed to create Python virtual environment."
        exit /b 1
    )
)
if exist "%APP_DIR%\requirements.txt" (
    call :log "Installing Python dependencies from requirements.txt..."
    "%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        call :log "Failed to upgrade pip inside the virtual environment."
        exit /b 1
    )
    "%VENV_DIR%\Scripts\pip.exe" install -r "%APP_DIR%\requirements.txt" >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        call :log "Failed to install Python dependencies."
        exit /b 1
    )
) else (
    call :log "No requirements.txt found; skipping Python dependency installation."
)
exit /b 0

:log
setlocal enabledelayedexpansion
set "MESSAGE=%~1"
if "%~1"=="" (
    echo.
    >> "%LOG_FILE%" echo.
) else (
    echo(!MESSAGE!
    >> "%LOG_FILE%" echo [%DATE% %TIME%] !MESSAGE!
)
endlocal
exit /b 0
