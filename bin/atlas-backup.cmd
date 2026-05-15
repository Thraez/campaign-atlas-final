@echo off
setlocal
pushd "%~dp0.."
call npm run atlas:backup
set ERR=%ERRORLEVEL%
popd
echo.
echo --- exit code: %ERR% ---
pause
exit /b %ERR%
