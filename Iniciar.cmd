@echo off
cd /d "%~dp0"
powershell -NoProfile -File scripts\setup-local.ps1
if errorlevel 1 goto fim
cargo run
:fim
pause
