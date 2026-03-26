@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Student Support WebApp Server

set "PORT=8000"
if not "%~1"=="" set "PORT=%~1"

set "ELEVATED=0"
if /I "%~2"=="--elevated" set "ELEVATED=1"

echo ================================================
echo Student Support WebApp Launcher
echo Port: %PORT%
echo ================================================
echo.
echo Keep this window open while using the web app.
echo To stop the server: press Ctrl+C then Y.
echo.

call :ensure_firewall_rule

set "PY_CMD="
where py >nul 2>nul
if %errorlevel%==0 set "PY_CMD=py -3"

if "%PY_CMD%"=="" (
  where python >nul 2>nul
  if %errorlevel%==0 set "PY_CMD=python"
)

if "%PY_CMD%"=="" goto no_python

echo Using Python command: %PY_CMD%
echo.

%PY_CMD% server.py --port %PORT%
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Server exited with code %EXIT_CODE%.
  echo [TIP] Another process may already use port %PORT%.
  echo [TIP] Try: start_webapp.bat 8080
  pause
)

goto end

:ensure_firewall_rule
set "RULE_NAME=StudentSupportWebApp_%PORT%"
net session >nul 2>nul
if not %errorlevel%==0 (
  if "%ELEVATED%"=="1" (
    echo [WARN] Admin permission was not granted. Skipping firewall auto-allow.
    goto :eof
  )

  echo Requesting admin permission to auto-allow inbound access on port %PORT%...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%PORT% --elevated' -Verb RunAs"
  if %errorlevel%==0 (
    echo [INFO] Elevated launcher started. Closing this window.
    exit /b 0
  )

  echo [WARN] UAC approval was canceled. Continuing without firewall auto-allow.
  goto :eof
)

netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>nul
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain >nul 2>nul
if %errorlevel%==0 (
  echo [OK] Firewall inbound rule added: %RULE_NAME%
) else (
  echo [WARN] Failed to add firewall rule automatically.
)
echo.
goto :eof

:no_python
echo [ERROR] Python was not found in PATH.
echo Install Python and try again: https://www.python.org/downloads/
pause

:end
endlocal
