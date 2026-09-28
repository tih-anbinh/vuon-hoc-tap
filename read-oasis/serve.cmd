@echo off
rem Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-27
rem Serve the DEV layout over HTTP (ES modules + fetch do not work from file://).
rem For double-click use, open dist\index.html instead (built by tools\build_single_file.py).
cd /d "%~dp0"
echo Read Oasis dev server: http://localhost:8080/index.html   (parent: /parent.html)
python -m http.server 8080
