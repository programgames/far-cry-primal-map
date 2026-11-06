@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js est introuvable. Installez-le depuis https://nodejs.org puis relancez.
  echo.
  pause
  exit /b 1
)

echo.
echo   Demarrage de la carte Far Cry Primal (Oros)...
echo   Fermez cette fenetre ou appuyez sur Ctrl+C pour arreter.
echo.

node server.js --open
pause
