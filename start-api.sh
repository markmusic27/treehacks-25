#!/bin/bash
# Start the Maestro API server for song generation

cd "$(dirname "$0")"

echo "============================================"
echo "  Starting Maestro API Server"
echo "============================================"
echo

# Activate venv if it exists
if [ -d ".venv" ]; then
    source .venv/bin/activate
    echo "✓ Virtual environment activated"
fi

# Check dependencies
python3 -c "import fastapi, uvicorn, pretty_midi" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠ Installing dependencies..."
    pip install fastapi uvicorn pretty_midi
fi

# Check for SoundFont
if [ ! -f "vision/soundfont.sf2" ]; then
    echo "⚠ SoundFont not found at vision/soundfont.sf2"
    echo "  Download one to enable MP3 generation"
fi

# Check for fluidsynth and ffmpeg
which fluidsynth >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠ fluidsynth not installed"
    echo "  Install: brew install fluid-synth"
fi

which ffmpeg >/dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "⚠ ffmpeg not installed"
    echo "  Install: brew install ffmpeg"
fi

echo
echo "Starting server on http://localhost:8000"
echo "Press Ctrl+C to stop"
echo

cd app && python3 api_server.py
