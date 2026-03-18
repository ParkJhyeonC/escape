@echo off
setlocal
cd /d %~dp0

echo [Escape Room] Windows server launcher
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치하세요.
  pause
  exit /b 1
)

echo 정적 서버를 시작합니다...
start "" http://localhost:4173
node server.js
if errorlevel 1 (
  echo 서버 실행에 실패했습니다.
  pause
  exit /b 1
)
