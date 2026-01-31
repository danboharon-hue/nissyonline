#!/bin/bash
set -e

PROJECT_DIR="$(pwd)"

echo "==> Cloning nissy-classic source..."
rm -rf /tmp/nissy-src
git clone --depth 1 https://github.com/sebastianotronto/nissy-classic.git /tmp/nissy-src

echo "==> Compiling nissy..."
cd /tmp/nissy-src
cc -std=c99 -pthread -pedantic -Wall -Wextra -Wno-unused-parameter -O3 \
    -DVERSION=\"2.0.8\" -o nissy src/*.c

echo "==> Copying binary to $PROJECT_DIR ..."
cp nissy "$PROJECT_DIR/nissy"
chmod +x "$PROJECT_DIR/nissy"

echo "==> Build complete!"
"$PROJECT_DIR/nissy" --version || true
