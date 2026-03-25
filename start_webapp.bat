@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title 학생맞춤통합지원 웹앱 서버

set "PORT=8000"
if not "%~1"=="" set "PORT=%~1"

echo ================================================
echo 학생맞춤통합지원 웹앱 실행
echo 포트: %PORT%
echo ================================================

echo.
echo [안내] 서버 창을 닫으면 웹앱도 종료됩니다.
echo [안내] 종료는 Ctrl+C 를 누른 뒤 Y 입력.
echo.

set "PY_CMD="
where py >nul 2>nul
if %errorlevel%==0 set "PY_CMD=py -3"

if "%PY_CMD%"=="" (
  where python >nul 2>nul
  if %errorlevel%==0 set "PY_CMD=python"
)

if "%PY_CMD%"=="" goto :no_python

echo [정보] 사용 파이썬: %PY_CMD%
echo [정보] 접속 주소는 실행 후 표시됩니다.
echo.

%PY_CMD% server.py --port %PORT%
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [오류] 서버가 비정상 종료되었습니다. (코드: %EXIT_CODE%)
  echo [점검] 다른 프로그램이 같은 포트(%PORT%)를 사용 중인지 확인하세요.
  echo [점검] 예: start_webapp.bat 8080
  pause
)

goto :end

:no_python
echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되지 않았습니다.
echo [안내] https://www.python.org/downloads/ 에서 설치 후 다시 실행하세요.
pause

:end
endlocal
