@echo off
rem Author: Huy Tran / Cadence Design Systems Vietnam / huytran@cadence.com / Created: 2026-09-28
rem Render British English narration for every book through the pronunciation lexicon, then rebuild.
rem One-time setup: create read-oasis\.env (git-ignored) containing:
rem     AZURE_SPEECH_KEY=xxxxxxxx
rem     AZURE_SPEECH_REGION=southeastasia
rem     TTS_PROVIDER=azure
rem     TTS_VOICE=en-GB-SoniaNeural
setlocal
cd /d "%~dp0"
if not exist .env (
  echo Missing .env with AZURE_SPEECH_KEY / AZURE_SPEECH_REGION. See the comment at the top of this file.
  pause & exit /b 1
)
for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do set "%%a=%%b"
if "%TTS_PROVIDER%"=="" set TTS_PROVIDER=azure
if "%TTS_VOICE%"=="" set TTS_VOICE=en-GB-SoniaNeural
echo == Building audio with %TTS_PROVIDER% / %TTS_VOICE% (pages normal+slow, word cards UK normal+very slow, US)
python tools\build_audio.py --provider %TTS_PROVIDER% --voice %TTS_VOICE% --us %*
if errorlevel 1 ( echo *** audio build failed & pause & exit /b 1 )
echo.
echo == Validate + index + stamp + dist
python tools\validate_content.py --index && python tools\build_single_file.py
echo.
echo Done. Listen-check a few pages in dist\index.html, then push read-oasis\ (content\audio\ included).
pause
