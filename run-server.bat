@echo off
setlocal enableextensions
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto :missing_node

if not exist server.js goto :missing_server

echo [Escape Room] Starting local server on http://localhost:4173/
start "" "http://localhost:4173/"
node server.js
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" goto :server_failed
exit /b 0

:missing_node
echo [Escape Room] Node.js was not found.
echo Please install Node.js LTS from https://nodejs.org/ and run this file again.
pause
exit /b 1

:missing_server
echo [Escape Room] server.js was not found in this folder.
echo Make sure run-server.bat is inside the project root.
pause
exit /b 1

:server_failed
echo [Escape Room] The server stopped with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
