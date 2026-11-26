#!/bin/bash
cd "$(dirname "$0")"
if [ "$(uname -m)" = "arm64" ]; then NODE="runtime/arm64/bin/node"; else NODE="runtime/x64/bin/node"; fi
xattr -dr com.apple.quarantine . 2>/dev/null
"$NODE" start.cjs
