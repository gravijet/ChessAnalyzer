# ChessAnalyzer

Browser-based chess analysis with Stockfish. Import PGN files or games from Chess.com, review moves and play from a selected position against the engine.

```sh
npm install
npm run dev
npm run build
npm run test
npm run lint
```

The build copies the Stockfish engine into `public/stockfish/`. Games and analysis are stored locally in IndexedDB.

The threaded engine requires cross-origin isolation headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
