@echo off
title SkyDock

echo.
echo   SkyDock - Tandem Jump Media Manager
echo   ===================================
echo.

if not exist "output" mkdir output

echo Starting SkyDock...
echo.

start "" "http://localhost:3000"

docker compose up --build
