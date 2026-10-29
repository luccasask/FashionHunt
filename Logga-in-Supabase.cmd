@echo off
setlocal
cd /d "%~dp0"
echo Logga in i webblasaren som Supabase oppnar. Inga losenord ska skickas i chatten.
call node_modules\.bin\supabase.cmd login --name fashionhunt --agent no --output-format text
pause
