@echo off
rem Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-27
rem One-click "content changed" step for Windows:
rem   1) validate every book, rebuild content\index.json (PUBLISHED only), stamp sw.js VERSION
rem   2) rebuild dist\index.html + dist\parent.html (double-click copies)
rem Then push the read-oasis folder to the repo.
setlocal
cd /d "%~dp0"
echo == Validate content + rebuild index + stamp service worker
python tools\validate_content.py --index
if errorlevel 1 (
  echo.
  echo *** Validation FAILED. Fix the errors above; index.json was still written for the books that passed.
  pause
  exit /b 1
)
echo.
echo == Rebuild dist\ (single-file copies)
python tools\build_single_file.py
if errorlevel 1 ( echo *** Build failed. & pause & exit /b 1 )
echo.
echo == Tidy: move backups/scratch out of the push tree into bak\
for /d /r %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
for /r %%f in (*.bak *.orig) do @if /i not "%%~dpf"=="%~dp0bak\" (
  if not exist "bak\%%~pf" mkdir "bak\%%~pf" 2>nul
  move /y "%%f" "bak\%%~pf" >nul && echo moved %%f
)
if exist BATCH_NOTES.md move /y BATCH_NOTES.md bak\ >nul && echo moved BATCH_NOTES.md
if exist tools\generate_year1_collection.py move /y tools\generate_year1_collection.py bak\tools\ >nul && echo moved tools\generate_year1_collection.py
echo.
echo Done. Push the read-oasis folder (bak\ is git-ignored).
pause
