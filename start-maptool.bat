@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "REPO_URLS=https://github.com/Korialstrasz2/MapTool.git"
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

call :log_section "Dependency Check"
call :log "Checking required dependencies..."
call :ensure_dependency git "Git is required but was not found in PATH."
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('git --version 2^>nul') do call :log "%%~I"
call :ensure_dependency npm "Node.js (npm) is required but was not found in PATH."
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('npm --version 2^>nul') do call :log "%%~I"
call :ensure_dependency node "Node.js runtime (node) is required but was not found in PATH."
if errorlevel 1 goto :fail
for /f "delims=" %%I in ('node --version 2^>nul') do call :log "Node.js runtime %%~I"
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

call :log_section "Repository Synchronization"
if exist "%APP_DIR%\.git" (
    call :log "Switching to existing repository at %APP_DIR%..."
    pushd "%APP_DIR%" >nul 2>nul
    if errorlevel 1 (
        call :log "Failed to change directory to %APP_DIR%."
        goto :fail
    )
    set "DID_PUSH=1"
    call :log "Now operating from %CD%."
    call :log "Updating existing MapTool checkout..."
    call :run_command git fetch --tags --prune
    if errorlevel 1 goto :fail

    set "TARGET_BRANCH="
    for /f "tokens=3" %%B in ('git remote show origin ^| findstr /C:"HEAD branch:"') do (
        set "TARGET_BRANCH=%%B"
    )

    if not defined TARGET_BRANCH (
        for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do (
            set "TARGET_BRANCH=%%B"
        )
    )

    if /I "!TARGET_BRANCH!"=="(unknown)" set "TARGET_BRANCH="

    if defined TARGET_BRANCH (
        call :log "Checking out branch !TARGET_BRANCH!..."
        call :run_command git checkout !TARGET_BRANCH!
        if errorlevel 1 goto :fail
    ) else (
        call :log "Unable to determine default git branch; continuing without switching branches."
    )

    call :run_command git pull --ff-only
    if errorlevel 1 goto :fail
) else (
    call :log "Downloading the latest MapTool sources..."
    call :clone_repository
    if errorlevel 1 goto :fail
    if defined REPO_URL_USED call :log "Repository cloned from !REPO_URL_USED!."
    pushd "%APP_DIR%" >nul 2>nul
    if errorlevel 1 (
        call :log "Failed to change directory to %APP_DIR% after cloning."
        goto :fail
    )
    call :log "Repository cloned; operating from %CD%."
    set "DID_PUSH=1"
)

call :log_section "Python Environment Setup"
call :ensure_virtualenv
if errorlevel 1 goto :fail

call :log_section "Node Dependency Installation"
call :log "Installing npm dependencies (this may take a moment)..."
call :run_command npm install
if errorlevel 1 goto :fail
call :log "npm dependencies installed successfully."

call :log_section "WebAssembly Build"
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

call :log_section "Development Server Startup"
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
set "COMMAND_CWD=%CD%"
set "COMMAND_START_STAMP="
set "COMMAND_TIMING_AVAILABLE=0"
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')" 2^>nul`) do set "COMMAND_START_STAMP=%%~I"
if defined COMMAND_START_STAMP set "COMMAND_TIMING_AVAILABLE=1"
if not defined COMMAND_START_STAMP set "COMMAND_START_STAMP=%DATE% %TIME%"
call :log "Running command: !COMMAND! (started !COMMAND_START_STAMP!, cwd !COMMAND_CWD!)"
>> "%LOG_FILE%" echo [%DATE% %TIME%] [command] !COMMAND!
if "!COMMAND:~0,1!"=="\"" (
    cmd.exe /d /c ""!COMMAND!"" >> "%LOG_FILE%" 2>&1
) else (
    cmd.exe /d /c !COMMAND! >> "%LOG_FILE%" 2>&1
)
set "EXITCODE=!ERRORLEVEL!"
set "COMMAND_END_STAMP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')" 2^>nul`) do set "COMMAND_END_STAMP=%%~I"
if not defined COMMAND_END_STAMP (
    set "COMMAND_END_STAMP=%DATE% %TIME%"
    set "COMMAND_TIMING_AVAILABLE=0"
)
set "COMMAND_DURATION="
if "!COMMAND_TIMING_AVAILABLE!"=="1" (
    for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "(New-TimeSpan -Start ([datetime]'!COMMAND_START_STAMP!') -End ([datetime]'!COMMAND_END_STAMP!')).TotalSeconds.ToString('0.###')" 2^>nul`) do set "COMMAND_DURATION=%%~I"
)
if "!EXITCODE!"=="0" (
    if defined COMMAND_DURATION (
        call :log "Command completed successfully in !COMMAND_DURATION! seconds (finished !COMMAND_END_STAMP!): !COMMAND!"
    ) else (
        call :log "Command completed successfully (finished !COMMAND_END_STAMP!): !COMMAND!"
    )
) else (
    if defined COMMAND_DURATION (
        call :log "Command failed with exit code !EXITCODE! after !COMMAND_DURATION! seconds (finished !COMMAND_END_STAMP!): !COMMAND!"
    ) else (
        call :log "Command failed with exit code !EXITCODE! (finished !COMMAND_END_STAMP!): !COMMAND!"
    )
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

:create_virtualenv
setlocal enabledelayedexpansion
set "TARGET_DIR=%~1"

if not defined TARGET_DIR (
    call :log "No target directory specified for virtual environment creation."
    endlocal & exit /b 1
)

set "TARGET_CANON="
set "TARGET_PARENT_RAW="
set "TARGET_BASENAME="
for %%I in ("!TARGET_DIR!") do (
    set "TARGET_CANON=%%~fI"
    set "TARGET_PARENT_RAW=%%~dpI"
    set "TARGET_BASENAME=%%~nxI"
)
if not defined TARGET_CANON set "TARGET_CANON=!TARGET_DIR!"
if not defined TARGET_PARENT_RAW for %%I in ("!TARGET_CANON!") do set "TARGET_PARENT_RAW=%%~dpI"
if not defined TARGET_BASENAME for %%I in ("!TARGET_CANON!") do set "TARGET_BASENAME=%%~nxI"

set "TARGET_PARENT_TRIM=!TARGET_PARENT_RAW!"
if defined TARGET_PARENT_TRIM if "!TARGET_PARENT_TRIM:~-1!"=="\" set "TARGET_PARENT_TRIM=!TARGET_PARENT_TRIM:~0,-1!"

set "TARGET_SHORT="
if exist "!TARGET_CANON!" (
    for %%I in ("!TARGET_CANON!") do set "TARGET_SHORT=%%~sI"
) else (
    mkdir "!TARGET_CANON!" >nul 2>nul
    if not errorlevel 1 (
        for %%I in ("!TARGET_CANON!") do set "TARGET_SHORT=%%~sI"
    )
    if exist "!TARGET_CANON!" rd /s /q "!TARGET_CANON!" >nul 2>nul
)
if not defined TARGET_SHORT set "TARGET_SHORT=!TARGET_CANON!"

set "APP_CANON="
for %%A in ("%APP_DIR%") do set "APP_CANON=%%~fA"
if defined APP_CANON if "!APP_CANON:~-1!"=="\" set "APP_CANON=!APP_CANON:~0,-1!"

call :log "Requesting virtual environment at !TARGET_CANON! (source argument: %~1)."

call :run_command "%PYTHON_CMD%" -m venv "!TARGET_CANON!"
set "EXITCODE=!ERRORLEVEL!"
if "!EXITCODE!"=="0" goto :create_virtualenv_success

if exist "!TARGET_CANON!" rd /s /q "!TARGET_CANON!" >nul 2>nul

if defined TARGET_PARENT_TRIM if defined APP_CANON if /I "!TARGET_PARENT_TRIM!"=="!APP_CANON!" if defined TARGET_BASENAME if exist "!TARGET_PARENT_TRIM!\" (
    call :log "Virtual environment creation failed with exit code !EXITCODE!; retrying from !TARGET_PARENT_TRIM! using relative path !TARGET_BASENAME!..."
    pushd "!TARGET_PARENT_TRIM!"
    call :run_command "%PYTHON_CMD%" -m venv "!TARGET_BASENAME!"
    set "EXITCODE=!ERRORLEVEL!"
    popd
)
if "!EXITCODE!"=="0" goto :create_virtualenv_success

if exist "!TARGET_CANON!" rd /s /q "!TARGET_CANON!" >nul 2>nul

if defined TARGET_SHORT if /I not "!TARGET_SHORT!"=="!TARGET_CANON!" (
    call :log "Virtual environment creation failed with exit code !EXITCODE!; retrying with short path !TARGET_SHORT!..."
    call :run_command "%PYTHON_CMD%" -m venv "!TARGET_SHORT!"
    set "EXITCODE=!ERRORLEVEL!"
)
if "!EXITCODE!"=="0" goto :create_virtualenv_success

if exist "!TARGET_CANON!" rd /s /q "!TARGET_CANON!" >nul 2>nul
endlocal & exit /b !EXITCODE!

:create_virtualenv_success
call :log "Virtual environment creation succeeded at !TARGET_CANON!."
endlocal & exit /b 0

:ensure_virtualenv
set "VENV_DIR="
set "VENV_STATUS=new"
call :log "Scanning for existing virtual environments in %APP_DIR%..."
for %%D in (.venv venv) do (
    if not defined VENV_DIR if exist "%APP_DIR%\%%D\Scripts\python.exe" (
        call :log "Found existing Python virtual environment candidate at %APP_DIR%\%%D."
        set "VENV_DIR=%APP_DIR%\%%D"
        set "VENV_STATUS=existing"
    )
)
if not defined VENV_DIR (
    set "VENV_DIR=%APP_DIR%\.venv"
    call :log "No existing virtual environment detected; defaulting to %APP_DIR%\.venv."
)

if "%VENV_STATUS%"=="existing" (
    call :log "Using existing Python virtual environment at !VENV_DIR!."
) else (
    call :log "Creating Python virtual environment at !VENV_DIR!..."
    call :create_virtualenv "!VENV_DIR!"
    if errorlevel 1 (
        set "FALLBACK_VENV=%APP_DIR%\venv"
        if /I "!VENV_DIR!"=="!FALLBACK_VENV!" (
            call :log "Failed to create Python virtual environment."
            exit /b 1
        )
        call :log "Retrying virtual environment creation in legacy folder !FALLBACK_VENV!..."
        call :create_virtualenv "!FALLBACK_VENV!"
        if errorlevel 1 (
            call :log "Failed to create Python virtual environment."
            exit /b 1
        )
        set "VENV_DIR=!FALLBACK_VENV!"
    )
)

call :log "Verifying Python executable at !VENV_DIR!\Scripts\python.exe..."
if exist "!VENV_DIR!\Scripts\python.exe" (
    call :log "Python virtual environment ready at !VENV_DIR!."
) else (
    call :log "Python executable not found in !VENV_DIR! after virtual environment setup."
    exit /b 1
)

if exist "%APP_DIR%\requirements.txt" (
    call :log "Installing Python dependencies from requirements.txt..."
    call :run_command "!VENV_DIR!\Scripts\python.exe" -m pip install --upgrade pip
    if errorlevel 1 (
        call :log "Failed to upgrade pip inside the virtual environment."
        exit /b 1
    )
    call :log "pip upgraded successfully."
    call :run_command "!VENV_DIR!\Scripts\pip.exe" install -r "%APP_DIR%\requirements.txt"
    if errorlevel 1 (
        call :log "Failed to install Python dependencies."
        exit /b 1
    )
    call :log "Python dependencies installed successfully."
) else (
    call :log "No requirements.txt found; skipping Python dependency installation."
)
exit /b 0

:log_section
setlocal enabledelayedexpansion
set "SECTION_TITLE=%~1"
if not defined SECTION_TITLE set "SECTION_TITLE=General"
call :log ""
call :log "=============================="
call :log ">>> !SECTION_TITLE!"
call :log "=============================="
endlocal
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
