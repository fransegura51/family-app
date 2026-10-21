@echo off
rem Abre la prueba del correo de PEPA con OVH (hacer doble clic). No guarda la contrasena ni toca nada de PEPA.
chcp 65001 >nul
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo No encuentro Node.js en este ordenador. Pidele ayuda a Claude.
  echo.
  pause
  exit /b 1
)
node scripts\prueba-smtp-ovh.mjs %*
echo.
pause
