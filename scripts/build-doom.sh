#!/usr/bin/env bash
# Builds the cabin's Doom from pinned sources into public/doom/.
# Needs Linux x86-64, node 20+, curl, unzip, xz, and user namespaces (unshare).
# DOOM_BUILD_DIR overrides the work directory.
set -euo pipefail
export LC_ALL=C TZ=UTC

DOOMGENERIC_COMMIT=e257a09527062bfb986b6e5e0780839b6cbd5b71
DOOMGENERIC_SHA256=26f8f60daa6c6e4d3c01e5eac9fb700d592dede803d13ac848154ff356b2a2e7
FREEDOOM_VERSION=0.13.0
FREEDOOM_SHA256=3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59
EMSCRIPTEN_VERSION=6.0.12
EMSCRIPTEN_RELEASE=6e9f6885cb17a3d6c8fd488a5cff730f50aba61d
EMSCRIPTEN_SHA256=7b073a102b07eca5a0fe344037681e53162639f3540432456874c0446a5e8fa7

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
WORK=${DOOM_BUILD_DIR:-$HOME/.cache/danaimone-doom}
OUT=$ROOT/public/doom
MANIFEST=$ROOT/src/components/game/doom-files.json

fetch() {
  local url=$1 name=$2 sum=$3
  mkdir -p "$WORK/downloads"
  [ -f "$WORK/downloads/$name" ] || curl -fsSL --retry 3 -o "$WORK/downloads/$name.part" "$url"
  [ -f "$WORK/downloads/$name" ] || mv "$WORK/downloads/$name.part" "$WORK/downloads/$name"
  echo "$sum  $WORK/downloads/$name" | sha256sum -c --quiet -
}

fetch "https://codeload.github.com/ozkl/doomgeneric/tar.gz/$DOOMGENERIC_COMMIT" doomgeneric.tar.gz "$DOOMGENERIC_SHA256"
fetch "https://github.com/freedoom/freedoom/releases/download/v$FREEDOOM_VERSION/freedoom-$FREEDOOM_VERSION.zip" freedoom.zip "$FREEDOOM_SHA256"
fetch "https://storage.googleapis.com/webassembly/emscripten-releases-builds/linux/$EMSCRIPTEN_RELEASE/wasm-binaries.tar.xz" emscripten.tar.xz "$EMSCRIPTEN_SHA256"

if [ ! -f "$WORK/emscripten/.done" ]; then
  rm -rf "$WORK/emscripten"
  mkdir -p "$WORK/emscripten"
  tar xJf "$WORK/downloads/emscripten.tar.xz" -C "$WORK/emscripten"
  touch "$WORK/emscripten/.done"
fi

rm -rf "$WORK/source" "$WORK/freedoom" "$WORK/build"
mkdir -p "$WORK/source" "$WORK/freedoom" "$WORK/build" "$WORK/em-cache"
tar xzf "$WORK/downloads/doomgeneric.tar.gz" -C "$WORK/source" --strip-components=1
unzip -q -j "$WORK/downloads/freedoom.zip" -d "$WORK/freedoom"

cat > "$WORK/emscripten.config" <<CONFIG
LLVM_ROOT = '$WORK/emscripten/install/bin'
BINARYEN_ROOT = '$WORK/emscripten/install'
NODE_JS = '$(command -v node)'
CACHE = '$WORK/em-cache'
CONFIG

cp "$ROOT/scripts/doom/platform.c" "$WORK/source/doomgeneric/site_platform.c"
UNITS=$(sed -n 's/^SRC_DOOM = //p' "$WORK/source/doomgeneric/Makefile" | sed 's/doomgeneric_xlib\.o/site_platform.o/; s/\.o\b/.c/g')

COMPILE=$(cat <<COMMAND
cd "$WORK/source/doomgeneric"
EM_CONFIG="$WORK/emscripten.config" "$WORK/emscripten/install/emscripten/emcc" -O3 -w \
  -ffile-prefix-map="$WORK/source"=. \
  -DNORMALUNIX -DLINUX -D_DEFAULT_SOURCE -DDOOMGENERIC_RESX=320 -DDOOMGENERIC_RESY=200 \
  $UNITS \
  -sENVIRONMENT=worker -sMODULARIZE=1 -sEXPORT_NAME=createDoom \
  -sDYNAMIC_EXECUTION=0 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=0 -sINVOKE_RUN=0 \
  -sINITIAL_MEMORY=96MB -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=1MB \
  -sINCOMING_MODULE_JS_API=instantiateWasm,print,printErr \
  -sEXPORTED_RUNTIME_METHODS=FS,HEAPU8 \
  -sEXPORTED_FUNCTIONS=_site_start,_site_tick,_site_key,_site_rgba \
  -o "$WORK/build/doom.js"
COMMAND
)
unshare -rn bash -euc "$COMPILE"

rm -rf "$OUT"
mkdir -p "$OUT" "$(dirname "$MANIFEST")"
cat "$WORK/build/doom.js" "$ROOT/scripts/doom/worker.js" > "$OUT/engine.js"
gzip -9nc "$WORK/build/doom.wasm" > "$OUT/doom-wasm.bin"
gzip -9nc "$WORK/freedoom/freedoom1.wad" > "$OUT/freedoom1-wad.bin"
cp "$WORK/source/LICENSE" "$OUT/GPL-2.0.txt"
cp "$WORK/freedoom/COPYING.txt" "$OUT/FREEDOOM-COPYING.txt"
cp "$WORK/freedoom/CREDITS.txt" "$OUT/FREEDOOM-CREDITS.txt"
cp "$WORK/emscripten/install/emscripten/LICENSE" "$OUT/EMSCRIPTEN-LICENSE.txt"
cp "$WORK/emscripten/install/emscripten/system/lib/libc/musl/COPYRIGHT" "$OUT/MUSL-COPYRIGHT.txt"
cp "$WORK/emscripten/install/emscripten/system/lib/compiler-rt/LICENSE.TXT" "$OUT/COMPILER-RT-LICENSE.txt"
cp "$ROOT/scripts/build-doom.sh" "$OUT/build-doom.sh"

tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner --exclude=screenshots \
  -czf "$OUT/doom-source.tar.gz" \
  -C "$WORK/source" --transform 's,^\.,doom-source/doomgeneric,' . \
  -C "$ROOT" --transform 's,^scripts,doom-source/scripts,' scripts/build-doom.sh scripts/doom

integrity() { echo "sha384-$(openssl dgst -sha384 -binary "$1" | base64 -w0)"; }
sha() { sha256sum "$1" | cut -d' ' -f1; }
cat > "$MANIFEST" <<JSON
{
  "doomgenericCommit": "$DOOMGENERIC_COMMIT",
  "freedoomVersion": "$FREEDOOM_VERSION",
  "emscriptenVersion": "$EMSCRIPTEN_VERSION",
  "wasm": { "url": "/doom/doom-wasm.bin", "integrity": "$(integrity "$OUT/doom-wasm.bin")" },
  "wad": { "url": "/doom/freedoom1-wad.bin", "integrity": "$(integrity "$OUT/freedoom1-wad.bin")" },
  "sourceSha256": "$(sha "$OUT/doom-source.tar.gz")"
}
JSON

(cd "$OUT" && sha256sum engine.js doom-wasm.bin freedoom1-wad.bin doom-source.tar.gz)
