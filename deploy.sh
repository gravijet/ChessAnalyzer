#!/usr/bin/env bash
# Baut das Projekt und deployed es auf diesen Server (nginx unter
# /var/www/chess.benjaminberger.at). Für Updates einfach erneut ausführen.
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Installiere Dependencies..."
npm install

echo "→ Baue Produktions-Build (inkl. voller Stockfish-Engine)..."
npm run build

echo "→ Kopiere nach /var/www/chess.benjaminberger.at ..."
sudo rsync -a --delete dist/ /var/www/chess.benjaminberger.at/
sudo chown -R www-data:www-data /var/www/chess.benjaminberger.at

echo "→ Fertig. Live unter https://chess.benjaminberger.at"
