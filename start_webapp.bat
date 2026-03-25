@echo off
setlocal
cd /d "%~dp0"

echo ================================================
echo 학생맞춤통합지원 웹앱 실행

echo ================================================

set "PORT=8000"

if not "%~1"=="" (
  set "PORT=%~1"
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo Python Launcher 감지: py
  py -3 server.py --port %PORT%
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  echo Python 감지: python
  python server.py --port %PORT%
  goto :end
)

echo [오류] Python이 설치되어 있지 않습니다.
echo https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.

:end
endlocal
