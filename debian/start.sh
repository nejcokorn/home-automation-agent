#!/bin/sh
set -e

APP_HOME=/opt/home-automation-agent
NODE_HOME="$APP_HOME/node"

export NODE_ENV=${NODE_ENV:-production}

exec "$NODE_HOME/bin/node" "$APP_HOME/app/dist/main.js"
