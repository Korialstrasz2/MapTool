@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "REPO_URLS=https://github.com/RPTools/maptool-app.git https://github.com/RPTools/maptool.git https://github.com/JeremyTCD/MapTool.git"
set "APP_DIR=%SCRIPT_DIR%maptool-app"
set "PRIMARY_PORT=5173"
set "FALLBACK_PORT=8010"
set "DID_PUSH=0"
set "LOG_FILE=%SCRIPT_DIR%start-maptool.log"
set "REPO_URL_USED="

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
for /f "delims=" %%I in ('git --version 2^>nul') do call :log "%%~I"
call :ensure_dependency npm "Node.js (npm) is required but was not found in PATH."
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('npm --version 2^>nul') do call :log "%%~I"
call :locate_python
if errorlevel 1 (
    call :log "Python is required to create a virtual environment but was not found in PATH."
    goto :fail
)
call :log "Python located at %PYTHON_CMD%."
for /f "delims=" %%I in ('"%PYTHON_CMD%" --version 2^>nul') do call :log "%%~I"
set "HAS_CARGO=0"
set "CARGO_PATH="
for /f "delims=" %%I in ('where cargo 2^>nul') do (
    set "HAS_CARGO=1"
    set "CARGO_PATH=%%~I"
    goto :cargo_check_done
)
:cargo_check_done
if "%HAS_CARGO%"=="1" (
    call :log "Rust (cargo) located at %CARGO_PATH%."
    for /f "delims=" %%I in ('cargo --version 2^>nul') do call :log "%%~I"
) else (
    call :log "Rust (cargo) was not found in PATH. WebAssembly build will be skipped and the JavaScript fallback will be used."
    call :log "Install Rust from https://rustup.rs/ to enable the high-performance terrain generator."
)
call :log "Dependency check completed."

if exist "%APP_DIR%\.git" (
    pushd "%APP_DIR%"
    set "DID_PUSH=1"
    call :log "Updating existing MapTool checkout..."
    call :run_command git fetch --tags --prune
    if errorlevel 1 goto :fail
    call :run_command git checkout main
    if errorlevel 1 goto :fail
    call :run_command git pull --ff-only
    if errorlevel 1 goto :fail
) else (
    call :log "Downloading the latest MapTool sources..."
    call :clone_repository
    if errorlevel 1 goto :fail
    if defined REPO_URL_USED call :log "Repository cloned from %REPO_URL_USED%."
    pushd "%APP_DIR%"
    set "DID_PUSH=1"
)

call :ensure_virtualenv
if errorlevel 1 goto :fail

call :log "Installing npm dependencies (this may take a moment)..."
call :run_command npm install
if errorlevel 1 goto :fail
call :log "npm dependencies installed successfully."

if "%HAS_CARGO%"=="1" (
    call :ensure_wasm_pack
    if errorlevel 1 goto :fail
    for /f "delims=" %%I in ('"%WASM_PACK%" --version 2^>nul') do call :log "wasm-pack version: %%I"

    call :log "Building WebAssembly package..."
    call :run_command npm run wasm
    if errorlevel 1 goto :fail
    call :log "WebAssembly package built successfully."
) else (
    call :log "Skipping WebAssembly build because Rust toolchain is unavailable."
)

call :log "Starting MapTool on port %PRIMARY_PORT% (fallback %FALLBACK_PORT%)..."
call :run_command npm run dev -- --host --port %PRIMARY_PORT% --strictPort
if errorlevel 1 (
    call :log "Port %PRIMARY_PORT% unavailable or dev server failed to start, retrying on %FALLBACK_PORT%..."
    call :run_command npm run dev -- --host --port %FALLBACK_PORT% --strictPort
    if errorlevel 1 goto :fail
)
goto :cleanup

:fail
set "FAILURE_CODE=%ERRORLEVEL%"
call :log ""
call :log "An error occurred (exit code %FAILURE_CODE%). Review %LOG_FILE% for details."
call :log "Showing recent log output (up to last 40 lines):"
call :print_log_tail
goto :cleanup

:cleanup
if "%DID_PUSH%"=="1" popd
call :log ""
call :log "Detailed log saved to %LOG_FILE%."
endlocal
exit /b %ERRORLEVEL%

:run_command
setlocal enabledelayedexpansion
set "COMMAND=%*"
if not defined COMMAND (
    endlocal & exit /b 0
)
call :log "Running command: !COMMAND!"
>> "%LOG_FILE%" echo [%DATE% %TIME%] [command] !COMMAND!
cmd.exe /d /c !COMMAND! >> "%LOG_FILE%" 2>&1
set "EXITCODE=!ERRORLEVEL!"
if not "!EXITCODE!"=="0" (
    call :log "Command failed with exit code !EXITCODE!: !COMMAND!"
)
endlocal & exit /b %EXITCODE%

:print_log_tail
setlocal
set "POWERSHELL_CMD="
for /f "delims=" %%I in ('where powershell 2^>nul') do (
    set "POWERSHELL_CMD=%%~I"
    goto :print_tail_ps
)
goto :print_tail_type

:print_tail_ps
if not defined POWERSHELL_CMD goto :print_tail_type
"%POWERSHELL_CMD%" -NoProfile -Command "Get-Content -Path '%LOG_FILE%' -Tail 40"
goto :print_tail_end

:print_tail_type
if exist "%LOG_FILE%" (
    type "%LOG_FILE%"
)

:print_tail_end
endlocal
exit /b 0

:clone_repository
set "REPO_URL_USED="
for %%U in (%REPO_URLS%) do (
    call :log "Attempting to clone repository from %%~U..."
    call :run_command git clone "%%~U" "%APP_DIR%"
    if not errorlevel 1 (
        set "REPO_URL_USED=%%~U"
        goto :clone_repository_success
    )
    call :log "Clone attempt from %%~U failed."
)
goto :clone_repository_failure

:clone_repository_success
if defined REPO_URL_USED call :log "Successfully cloned MapTool sources."
exit /b 0

:clone_repository_failure
call :log "Failed to clone MapTool from any known repository URL."
exit /b 1

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
    call :run_command "%PYTHON_CMD%" -m venv "%VENV_DIR%"
    if errorlevel 1 (
        call :log "Failed to create Python virtual environment."
        exit /b 1
    )
)
if exist "%APP_DIR%\requirements.txt" (
    call :log "Installing Python dependencies from requirements.txt..."
    call :run_command "%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip
    if errorlevel 1 (
        call :log "Failed to upgrade pip inside the virtual environment."
        exit /b 1
    )
    call :run_command "%VENV_DIR%\Scripts\pip.exe" install -r "%APP_DIR%\requirements.txt"
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
