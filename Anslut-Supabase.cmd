@echo off
setlocal
cd /d "%~dp0"
set "KLADER_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "KLADER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%KLADER_NODE%" scripts/configure-supabase.mjs
pause
