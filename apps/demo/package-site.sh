#!/usr/bin/env bash
# Builds the full demo site as two zips (Windows, Mac) that run with a double-click:
# a self-contained Next.js server, a bundled Node.js, and start scripts.
# Usage: apps/demo/package-site.sh [output-dir]   (run from anywhere)
set -euo pipefail
NODE_VERSION=v22.23.5
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
OUT="${1:-$HERE/dist}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "Building the web app as a standalone server"
rm -rf "$REPO/apps/web/.next"
(cd "$REPO" && NEXT_OUTPUT=standalone pnpm --filter web build >/dev/null)
STANDALONE="$REPO/apps/web/.next/standalone"

APP="$WORK/app"
mkdir -p "$APP/node_modules" "$APP/apps/web"
# Flatten pnpm's linked node_modules into one plain folder: no symlinks (Windows zips) and short paths.
node -e '
const fs=require("fs"),path=require("path");const [src,dst]=process.argv.slice(1);
const base=path.join(src,"node_modules/.pnpm");const seen=new Map();
for(const s of fs.readdirSync(base)){const nm=path.join(base,s,"node_modules");if(!fs.existsSync(nm))continue;
 for(const n of fs.readdirSync(nm)){const names=n.startsWith("@")?fs.readdirSync(path.join(nm,n)).map(x=>n+"/"+x):[n];
  for(const p of names){const real=fs.realpathSync(path.join(nm,p));
   if(seen.has(p)&&seen.get(p)!==real)throw new Error("two versions of "+p);
   if(seen.has(p))continue;seen.set(p,real);
   if(p==="sharp"||p.startsWith("@img/"))continue; // image optimisation is not used
   fs.cpSync(real,path.join(dst,"node_modules",p),{recursive:true,dereference:true});}}}
console.log("  "+seen.size+" packages");' "$STANDALONE" "$APP"
cp -RL "$STANDALONE/packages" "$APP/packages"
cp "$STANDALONE/package.json" "$APP/package.json"
(cd "$STANDALONE/apps/web" && tar --exclude=node_modules -cf - .) | (cd "$APP/apps/web" && tar -xf -)
mkdir -p "$APP/apps/web/.next"
cp -R "$REPO/apps/web/.next/static" "$APP/apps/web/.next/static"
cp -R "$REPO/apps/web/public" "$APP/apps/web/public"
rm -rf "$APP/apps/web/.data"
if find "$APP" -type l | grep -q .; then echo "symlinks left in the package" >&2; exit 1; fi

echo "Fetching Node.js $NODE_VERSION"
DL="${NODE_CACHE:-$WORK/node}"
mkdir -p "$DL"
for f in "node-$NODE_VERSION-win-x64.zip" "node-$NODE_VERSION-darwin-arm64.tar.gz" "node-$NODE_VERSION-darwin-x64.tar.gz" SHASUMS256.txt; do
  [ -f "$DL/$f" ] || curl -sSfL -o "$DL/$f" "https://nodejs.org/dist/$NODE_VERSION/$f"
done
(cd "$DL" && grep -E "win-x64.zip|darwin-(arm64|x64).tar.gz" SHASUMS256.txt | sha256sum -c --quiet)

make_pkg() { # $1 = Windows | Mac
  local name="Sunmarke-Lab-Booking-Demo" dir="$WORK/$1/Sunmarke-Lab-Booking-Demo"
  mkdir -p "$dir/runtime"
  cp -R "$APP" "$dir/app"
  cp "$HERE/site/start.cjs" "$HERE/site/Open me first.html" "$dir/"
  if [ "$1" = Windows ]; then
    cp "$HERE/site/"*Windows*.bat "$dir/"
    unzip -q -j "$DL/node-$NODE_VERSION-win-x64.zip" "node-$NODE_VERSION-win-x64/node.exe" -d "$dir/runtime"
  else
    cp "$HERE/site/"*Mac*.command "$dir/"
    for a in arm64 x64; do
      mkdir -p "$dir/runtime/$a/bin"
      tar -xzf "$DL/node-$NODE_VERSION-darwin-$a.tar.gz" -C "$dir/runtime/$a/bin" --strip-components=2 "node-$NODE_VERSION-darwin-$a/bin/node"
    done
    chmod +x "$dir/"*.command "$dir/runtime/"*/bin/node
  fi
  mkdir -p "$OUT"
  rm -f "$OUT/$name-$1.zip"
  (cd "$WORK/$1" && zip -qr -9 -X "$OUT/$name-$1.zip" "$name")
  echo "  $OUT/$name-$1.zip ($(du -h "$OUT/$name-$1.zip" | cut -f1))"
}
echo "Packaging"
make_pkg Windows
make_pkg Mac
