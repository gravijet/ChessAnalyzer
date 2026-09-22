#!/usr/bin/env bash
# Baut das Projekt und deployed es auf diesen Server (nginx unter
# /var/www/example.invalid). Für Updates einfach erneut ausführen.
set -euo pipefail

cd "$(dirname "$0")"

echo "→ Installiere Dependencies..."
npm install

echo "→ Baue Produktions-Build (inkl. voller Stockfish-Engine)..."
npm run build

echo "→ Kopiere nach /var/www/example.invalid ..."
sudo rsync -a --delete dist/ /var/www/example.invalid/
sudo chown -R www-data:www-data /var/www/example.invalid

echo "→ Fertig. Live unter https://example.invalid"
