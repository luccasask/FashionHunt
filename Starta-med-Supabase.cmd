@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.supabase.local" (
  echo Kor Anslut-Supabase.cmd forst.
  pause
  exit /b 1
)
set "KLADER_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "KLADER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%KLADER_NODE%" --env-file=.env.supabase.local app/server/index.mjs --lan
pause
