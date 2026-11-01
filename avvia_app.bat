@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
rem Tutto in un solo blocco: cmd lo legge intero prima di eseguirlo, cosi' un aggiornamento che sostituisce questo file mentre gira non lo rompe.
(
  set "PY="
  py -3 --version >nul 2>&1 && set "PY=py -3"
  if not defined PY ( python --version >nul 2>&1 && set "PY=python" )
  if not defined PY (
    echo Python non e installato: lo installo con winget, serve internet e qualche minuto...
    winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements
    if exist "%LocalAppData%\Programs\Python\Python312\python.exe" set PY="%LocalAppData%\Programs\Python\Python312\python.exe"
  )
  if not defined PY (
    echo.
    echo Non sono riuscito a installare Python da solo.
    echo Installalo da https://www.python.org/downloads/  ^(spunta "Add python.exe to PATH"^) e riapri questo file.
    pause
    exit /b 1
  )
  !PY! avvia.py
  if errorlevel 1 pause
  exit /b
)
