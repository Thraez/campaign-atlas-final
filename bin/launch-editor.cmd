@echo off
setlocal
pushd "%~dp0.."
echo [1/2] Building DM atlas...
call npm run atlas:build
if %ERRORLEVEL% neq 0 (
  echo.
  echo --- atlas:build failed, not starting dev server ---
  pause
  exit /b 1
)
echo.
echo [2/2] Starting editor (keep this window open)...
start "" "http://localhost:8080/atlas/edit"
call npm run dev
set ERR=%ERRORLEVEL%
popd
echo.
echo --- exit code: %ERR% ---
pause
exit /b %ERR%
