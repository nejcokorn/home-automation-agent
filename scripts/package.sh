#!/bin/sh
set -e

# Helper to build the app and Debian package with a bundled Node runtime.
# Usage:
#   NODE_VERSION=22.22.0 ./scripts/package.sh
#   NODE_VERSION=22.22.0 NODE_ARCH=arm64 ./scripts/package.sh
#   NODE_TARBALL=/path/to/node-vXX-linux-x64.tar.xz ./scripts/package.sh
#   (or ensure ./node/bin/node exists before running)

APP_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ -z "${NODE_TARBALL:-}" ] && [ -n "${NODE_VERSION:-}" ]; then
  case "$(uname -m)" in
    aarch64) default_arch=arm64 ;;
    armv7l) default_arch=armv7l ;;
    x86_64) default_arch=x64 ;;
    *) default_arch="" ;;
  esac

  if [ -z "${NODE_ARCH:-}" ]; then
    NODE_ARCH="$default_arch"
  fi

  if [ -z "${NODE_ARCH:-}" ]; then
    echo "Unable to detect NODE_ARCH; set NODE_ARCH (arm64|armv7l|x64)." >&2
    exit 1
  fi

  tmpdir=$(mktemp -d)
  cleanup() { rm -rf "$tmpdir"; }
  trap cleanup EXIT INT TERM

  NODE_TARBALL="$tmpdir/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
  echo "Downloading Node runtime from $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fL -o "$NODE_TARBALL" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$NODE_TARBALL" "$url"
  else
    echo "curl or wget is required to download Node." >&2
    exit 1
  fi
fi

if [ -n "${NODE_TARBALL:-}" ]; then
  if [ -d "$APP_ROOT/node" ] && [ -n "$(ls -A "$APP_ROOT/node" 2>/dev/null)" ]; then
    echo "./node already exists and is not empty; remove it or unset NODE_TARBALL." >&2
    exit 1
  fi
  echo "Extracting Node runtime from $NODE_TARBALL"
  mkdir -p "$APP_ROOT/node"
  tar -xf "$NODE_TARBALL" -C "$APP_ROOT/node" --strip-components=1
fi

if [ ! -x "$APP_ROOT/node/bin/node" ]; then
  echo "Bundled Node runtime missing at ./node/bin/node" >&2
  exit 1
fi

cd "$APP_ROOT"

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

npm run build
npm prune --omit=dev

if [ ! -d "$APP_ROOT/dist" ]; then
  echo "dist/ missing; build failed?" >&2
  exit 1
fi

if command -v dpkg-buildpackage >/dev/null 2>&1; then
  dpkg-buildpackage -us -uc
else
  echo "dpkg-buildpackage not found; install 'devscripts' and 'debhelper'." >&2
  exit 1
fi
