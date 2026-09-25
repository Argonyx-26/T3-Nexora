@echo off
REM Start AYU on Windows: backend API (and the frontend once it exists), each in its own window.
setlocal
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
set API_PORT=8000
set WEB_PORT=5173

cd backend
if exist .venv\Scripts\python.exe goto backend_ready
echo Installing backend dependencies...
where uv >nul 2>nul
if %errorlevel%==0 (
  uv venv --python 3.11 .venv
  uv pip install --python .venv\Scripts\python.exe -r requirements.txt
) else (
  py -3.11 -m venv .venv || python -m venv .venv
  .venv\Scripts\python.exe -m pip install -r requirements.txt
)
:backend_ready
echo API        http://127.0.0.1:%API_PORT%   (docs: /docs)
start "AYU API" cmd /k .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port %API_PORT%

cd ..\frontend
if not exist package.json goto done
if not exist node_modules call npm install
echo Dashboard  http://localhost:%WEB_PORT%
start "AYU Web" cmd /k npm run dev -- --port %WEB_PORT% --strictPort
:done
endlocal
