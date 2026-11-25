#!/bin/bash
cd "$(dirname "$0")"
if [ "$(uname -m)" = "arm64" ]; then NODE="runtime/arm64/bin/node"; else NODE="runtime/x64/bin/node"; fi
"$NODE" start.cjs --reset
