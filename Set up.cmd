@echo off
rem Makes the crab its own Python environment in this folder. Run once.
cd /d "%~dp0"
py -3.12 --version >nul 2>&1
if errorlevel 1 (
  echo Python 3.12 was not found. Install it from https://www.python.org/downloads/
  echo and tick "Add python.exe to PATH", then run this again.
  pause
  exit /b 1
)
echo Setting up. This takes a minute or two...
py -3.12 -m venv .venv || goto :failed
".venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
".venv\Scripts\python.exe" -m pip install --quiet anthropic==2.10.0 || goto :failed
".venv\Scripts\python.exe" -m pip install --quiet libzim==4.1.0
if errorlevel 1 echo (The offline encyclopedia library did not install. Everything else will work.)
echo.
echo Done. Double-click "Wake the crab.vbs" to start.
pause
exit /b 0
:failed
echo.
echo Setting up did not finish. Check your internet connection and try again.
pause
exit /b 1
