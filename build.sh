#!/bin/bash
set -e

echo "==> Cloning nissy-classic source..."
rm -rf /tmp/nissy-src
git clone --depth 1 https://github.com/sebastianotronto/nissy-classic.git /tmp/nissy-src

echo "==> Compiling nissy..."
cd /tmp/nissy-src
cc -std=c99 -pthread -pedantic -Wall -Wextra -Wno-unused-parameter -O3 \
    -DVERSION=\"2.0.8\" -o nissy src/*.c

echo "==> Copying binary..."
cp nissy /opt/render/project/src/nissy
chmod +x /opt/render/project/src/nissy

echo "==> Build complete!"
/opt/render/project/src/nissy --version || true
