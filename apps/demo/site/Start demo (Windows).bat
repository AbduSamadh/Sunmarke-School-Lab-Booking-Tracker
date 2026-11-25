@echo off
title Sunmarke Lab Booking demo
cd /d "%~dp0"
"%~dp0runtime\node.exe" "%~dp0start.cjs"
echo.
echo The demo has stopped. You can close this window.
pause >nul
