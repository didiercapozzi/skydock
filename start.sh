#!/bin/bash

echo ""
echo "  SkyDock - Tandem Jump Media Manager"
echo "  ==================================="
echo ""

mkdir -p output

echo "Starting SkyDock..."
echo ""

if command -v xdg-open &> /dev/null; then
  xdg-open "http://localhost:3000"
elif command -v open &> /dev/null; then
  open "http://localhost:3000"
fi

docker compose up --build
