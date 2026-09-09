@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================
:: Swen Windows build and packaging environment setup
:: ============================================================
:: Usage: run this script as Administrator
:: Purpose: install every dependency needed to build and package
:: ============================================================

title Swen environment setup

echo.
echo ============================================================
echo   Swen Windows build and packaging environment setup
echo ============================================================
echo.

:: -----------------------------------------------------------
:: Step 0: check for administrator rights
:: -----------------------------------------------------------
echo [0/8] Checking administrator rights...
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] This script must be run as Administrator.
    echo         Right-click this file and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)
echo       √ Running with administrator rights
echo.

:: -----------------------------------------------------------
:: Step 1: check for and install Node.js 24.x
:: -----------------------------------------------------------
echo [1/8] Checking Node.js...

:: Refresh PATH first so programs installed outside this session are found
set "PATH=C:\Program Files\nodejs;%PATH%"

where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
    echo !NODE_VER! | findstr /r "^v24\." >nul 2>&1
    if !errorlevel! equ 0 (
        echo       √ Node.js is installed: !NODE_VER!
    ) else (
        echo       ! Node.js is installed but the version is wrong: !NODE_VER!
        echo         Version 24.x is required, installing...
        winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
        if !errorlevel! neq 0 (
            echo       [WARNING] winget install failed. Download Node.js 24.x manually from https://nodejs.org/
        )
    )
) else (
    echo       Node.js is not installed, installing via winget...
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo       [WARNING] winget install failed. Download Node.js 24.x manually from https://nodejs.org/
    )
)

:: Refresh PATH
set "PATH=C:\Program Files\nodejs;%PATH%"
echo.

:: -----------------------------------------------------------
:: Step 2: check for and install Git
:: -----------------------------------------------------------
echo [2/8] Checking Git...

set "PATH=C:\Program Files\Git\cmd;%PATH%"

where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do set GIT_VER=%%v
    echo       √ Git is installed: !GIT_VER!
) else (
    echo       Git is not installed, installing via winget...
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo       [WARNING] winget install failed. Download Git manually from https://git-scm.com/
    )
    set "PATH=C:\Program Files\Git\cmd;%PATH%"
)
echo.

:: -----------------------------------------------------------
:: Step 3: check for and install 7-Zip
:: -----------------------------------------------------------
echo [3/8] Checking 7-Zip...

if exist "C:\Program Files\7-Zip\7z.exe" (
    echo       √ 7-Zip is installed
) else (
    echo       7-Zip is not installed, installing via winget...
    winget install 7zip.7zip --accept-source-agreements --accept-package-agreements
    if !errorlevel! neq 0 (
        echo       [WARNING] winget install failed. Download 7-Zip manually from https://www.7-zip.org/
    )
)
echo.

:: -----------------------------------------------------------
:: Step 4: enable Windows Developer Mode
:: -----------------------------------------------------------
echo [4/8] Enabling Windows Developer Mode for symbolic-link permissions...

reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense 2>nul | findstr "0x1" >nul 2>&1
if %errorlevel% equ 0 (
    echo       √ Windows Developer Mode is already enabled
) else (
    reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense /t REG_DWORD /d 1 /f >nul 2>&1
    reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowAllTrustedApps /t REG_DWORD /d 1 /f >nul 2>&1
    if !errorlevel! equ 0 (
        echo       √ Windows Developer Mode enabled
    ) else (
        echo       [WARNING] Could not enable it. Enable it manually under Settings -^> Update ^& Security -^> For developers
    )
)
echo.

:: -----------------------------------------------------------
:: Step 5: configure the PATH environment variable
:: -----------------------------------------------------------
echo [5/8] Configuring the PATH environment variable...

:: Read the current user PATH
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul ^| findstr Path') do set "CURRENT_USER_PATH=%%b"

set "NEED_UPDATE=0"
set "NEW_PATH=!CURRENT_USER_PATH!"

:: Check the Node.js path
echo !CURRENT_USER_PATH! | findstr /i "nodejs" >nul 2>&1
if !errorlevel! neq 0 (
    set "NEW_PATH=C:\Program Files\nodejs;!NEW_PATH!"
    set "NEED_UPDATE=1"
    echo       + Adding Node.js to PATH
)

:: Check the Git path
echo !CURRENT_USER_PATH! | findstr /i "Git\\cmd" >nul 2>&1
if !errorlevel! neq 0 (
    set "NEW_PATH=C:\Program Files\Git\cmd;!NEW_PATH!"
    set "NEED_UPDATE=1"
    echo       + Adding Git to PATH
)

:: Check the npm global path
echo !CURRENT_USER_PATH! | findstr /i "Roaming\\npm" >nul 2>&1
if !errorlevel! neq 0 (
    set "NEW_PATH=%APPDATA%\npm;!NEW_PATH!"
    set "NEED_UPDATE=1"
    echo       + Adding the npm global path to PATH
)

if "!NEED_UPDATE!"=="1" (
    setx PATH "!NEW_PATH!" >nul 2>&1
    echo       √ PATH updated. It takes effect in a new cmd window
) else (
    echo       √ PATH is already complete, nothing to change
)

:: Update PATH for the current session
set "PATH=C:\Program Files\nodejs;C:\Program Files\Git\cmd;%APPDATA%\npm;%PATH%"
echo.

:: -----------------------------------------------------------
:: Step 6: clean up interfering environment variables
:: -----------------------------------------------------------
echo [6/8] Cleaning up interfering environment variables...

:: Check for and remove ELECTRON_RUN_AS_NODE
reg query "HKCU\Environment" /v ELECTRON_RUN_AS_NODE >nul 2>&1
if %errorlevel% equ 0 (
    reg delete "HKCU\Environment" /v ELECTRON_RUN_AS_NODE /f >nul 2>&1
    echo       √ Removed user-level ELECTRON_RUN_AS_NODE
) else (
    echo       √ ELECTRON_RUN_AS_NODE is not set, as expected
)

reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v ELECTRON_RUN_AS_NODE >nul 2>&1
if %errorlevel% equ 0 (
    reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v ELECTRON_RUN_AS_NODE /f >nul 2>&1
    echo       √ Removed system-level ELECTRON_RUN_AS_NODE
)

:: Also clear it for the current session
set "ELECTRON_RUN_AS_NODE="
echo.

:: -----------------------------------------------------------
:: Step 7: install project dependencies
:: -----------------------------------------------------------
echo [7/8] Installing project dependencies with npm install...

:: Locate the project directory, one level above the script directory
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%.."

:: Check that package.json exists
if not exist "%PROJECT_DIR%\package.json" (
    echo       [ERROR] package.json not found.
    echo       Make sure this script lives in the project's scripts/ directory.
    echo       Path checked: %PROJECT_DIR%
    echo.
    goto :verify
)

cd /d "%PROJECT_DIR%"
echo       Project directory: %CD%

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo       [ERROR] The npm command is not available.
    echo       Close this window, open a new Administrator cmd window and run this script again.
    echo       Node.js was just installed and needs a new window to take effect.
    echo.
    goto :verify
)

:: Check whether node_modules already exists
if exist "node_modules\.bin\electron-builder.cmd" (
    echo       √ node_modules already exists, skipping install
    echo       To reinstall, delete the node_modules directory and run this script again.
) else (
    echo       Running npm install ...
    echo       The first install can take a few minutes, please wait.
    echo.
    call npm install
    if !errorlevel! neq 0 (
        echo.
        echo       [WARNING] npm install failed. Check your network connection and try again.
        echo       You can also try again with a mirror registry:
        echo         npm config set registry https://registry.npmmirror.com
        echo         npm install
    ) else (
        echo.
        echo       √ npm install finished
    )
)
echo.

:: -----------------------------------------------------------
:: Step 8: verify the environment
:: -----------------------------------------------------------
:verify
echo [8/8] Verifying the environment...
echo.

set "PASS_COUNT=0"
set "FAIL_COUNT=0"

:: Verify Node.js
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node --version 2^>nul') do (
        echo       [√] Node.js %%v
        set /a PASS_COUNT+=1
    )
) else (
    echo       [×] Node.js not found
    set /a FAIL_COUNT+=1
)

:: Verify npm
where npm >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('npm --version 2^>nul') do (
        echo       [√] npm %%v
        set /a PASS_COUNT+=1
    )
) else (
    echo       [×] npm not found
    set /a FAIL_COUNT+=1
)

:: Verify Git
where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do (
        echo       [√] %%v
        set /a PASS_COUNT+=1
    )
) else (
    echo       [×] Git not found
    set /a FAIL_COUNT+=1
)

:: Verify 7-Zip
if exist "C:\Program Files\7-Zip\7z.exe" (
    echo       [√] 7-Zip is installed
    set /a PASS_COUNT+=1
) else (
    echo       [×] 7-Zip not found
    set /a FAIL_COUNT+=1
)

:: Verify Windows Developer Mode
reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" /v AllowDevelopmentWithoutDevLicense 2>nul | findstr "0x1" >nul 2>&1
if %errorlevel% equ 0 (
    echo       [√] Windows Developer Mode is enabled
    set /a PASS_COUNT+=1
) else (
    echo       [×] Windows Developer Mode is not enabled
    set /a FAIL_COUNT+=1
)

:: Verify that ELECTRON_RUN_AS_NODE is not set
reg query "HKCU\Environment" /v ELECTRON_RUN_AS_NODE >nul 2>&1
if %errorlevel% neq 0 (
    echo       [√] ELECTRON_RUN_AS_NODE is not set, as expected
    set /a PASS_COUNT+=1
) else (
    echo       [×] ELECTRON_RUN_AS_NODE is still set and must be removed
    set /a FAIL_COUNT+=1
)

:: Verify node_modules
if exist "%PROJECT_DIR%\node_modules\.bin\electron-builder.cmd" (
    echo       [√] Project dependencies are installed
    set /a PASS_COUNT+=1
) else (
    echo       [×] Project dependencies are not installed, run npm install
    set /a FAIL_COUNT+=1
)

:: Verify the Electron binary
if exist "%PROJECT_DIR%\node_modules\electron\dist\electron.exe" (
    echo       [√] Electron binary downloaded
    set /a PASS_COUNT+=1
) else (
    echo       [×] Electron binary missing
    set /a FAIL_COUNT+=1
)

echo.
echo ============================================================

if !FAIL_COUNT! equ 0 (
    echo   ✅ All checks passed: !PASS_COUNT!/!PASS_COUNT!
    echo.
    echo   The environment is ready. Run the following in a new cmd window:
    echo.
    echo     cd %PROJECT_DIR%
    echo     npm run electron:dev          ^(development mode^)
    echo     npm run dist:win              ^(build the Windows installer^)
    echo.
    echo   Note: if Node.js or Git was installed just now,
    echo   close this window and open a new cmd window before running these commands.
) else (
    echo   ⚠ !FAIL_COUNT! check^(s^) failed. See the messages above.
    echo.
    echo   If Node.js / Git was installed for the first time:
    echo     1. Close this window
    echo     2. Open a new Administrator cmd window
    echo     3. Run this script again
)

echo ============================================================
echo.
pause
endlocal
