#!/bin/bash
# Double-click to start the game: serves this folder and opens the browser.
cd "$(dirname "$0")"
PORT=8000
while lsof -i :$PORT >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "Serving Settlers of the World at http://localhost:$PORT  (close this window to stop)"
( sleep 1; open "http://localhost:$PORT" ) &
python3 serve.py $PORT
