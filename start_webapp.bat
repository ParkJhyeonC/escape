@echo off
setlocal
cd /d "%~dp0"

title Student Support WebApp Server

set "PORT=8000"
if not "%~1"=="" set "PORT=%~1"

echo ================================================
echo Student Support WebApp Launcher
echo Port: %PORT%
echo ================================================
echo.
echo Keep this window open while using the web app.
echo To stop the server: press Ctrl+C then Y.
echo.

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

:no_python
echo [ERROR] Python was not found in PATH.
echo Install Python and try again: https://www.python.org/downloads/
pause

:end
endlocal
