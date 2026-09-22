// Copies the Stockfish WASM engine builds we actually use out of
// node_modules/stockfish/bin into public/stockfish so Vite serves them as
// static assets. Kept out of git (public/stockfish is gitignored) since the
// full-strength build alone is ~95MB — it's regenerated from the npm
// package on every install/build instead of being committed.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'node_modules', 'stockfish', 'bin')
const destDir = join(root, 'public', 'stockfish')

const files = [
  // Full-strength NNUE build (~95MB): used for deep game review.
  'stockfish-19.js',
  'stockfish-19.wasm',
  'stockfish-19-single.js',
  'stockfish-19-single.wasm',
  // Lite build (~1.6MB): used for instant live eval while playing/browsing.
  'stockfish-19-lite.js',
  'stockfish-19-lite.wasm',
  'stockfish-19-lite-single.js',
  'stockfish-19-lite-single.wasm',
]

if (!existsSync(srcDir)) {
  console.error(`[copy-stockfish] ${srcDir} not found — did "npm install" run?`)
  process.exit(1)
}

mkdirSync(destDir, { recursive: true })

for (const file of files) {
  const src = join(srcDir, file)
  if (!existsSync(src)) {
    console.warn(`[copy-stockfish] missing ${file}, skipping`)
    continue
  }
  copyFileSync(src, join(destDir, file))
}

console.log(`[copy-stockfish] copied ${files.length} engine files to public/stockfish`)
