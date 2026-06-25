#!/bin/bash
# Start a local HTTP server for the workspace files
# Usage: ./start-server.sh [port]

PORT=${1:-8080}
cd "$(dirname "$0")"
echo "🚀 Starting server at http://localhost:$PORT/"
echo "Press Ctrl+C to stop"
python3 -m http.server "$PORT"
