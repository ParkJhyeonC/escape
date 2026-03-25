@echo off
setlocal
cd /d %~dp0

if not exist .venv (
    echo [1/4] Creating virtual environment...
    py -m venv .venv
)

echo [2/4] Activating virtual environment...
call .venv\Scripts\activate

echo [3/4] Installing dependencies...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt

echo [4/4] Starting web app on http://localhost:5000
python app.py

endlocal
