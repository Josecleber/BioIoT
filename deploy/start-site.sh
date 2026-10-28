#!/bin/sh
set -eu
mkdir -p /data
touch /data/banco.db
exec node /app/site/server.js
