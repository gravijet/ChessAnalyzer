# ChessAnalyzer

Private chess-game-review tool: import games from a chess.com account or PGN,
get a full Stockfish-powered move-by-move review (Brilliant / Great / Best /
Excellent / Good / Book / Inaccuracy / Mistake / Blunder / Miss), see the
better move when you slipped, see brilliant moves you *could* have played,
and continue playing any position against the engine.

Runs entirely client-side — Stockfish (WASM) runs in your browser via a Web
Worker, games/analysis are cached in IndexedDB. No backend, no database.

## Development

```bash
npm install
npm run dev
```

`npm run dev`/`npm run build` copy the full Stockfish engine build
(`node_modules/stockfish` → `public/stockfish`, ~193MB, gitignored). Review
analysis defaults to the full-strength NNUE build (see `EngineSettings` in
`src/engine/defaultSettings.ts`); the smaller "lite" build is used for the
live eval bar while playing, where responsiveness matters more than depth.

## Testing

```bash
npm run test   # vitest — classification/eval-math unit tests
npm run lint   # oxlint
```

## Deployment (self-hosted, this server)

Static build, served directly by nginx from `/var/www/example.invalid`
— no Cloudflare Workers/Pages involved, so there's no static-asset size limit
and the full ~95MB engine ships as-is.

```bash
npm run deploy   # = ./deploy.sh: npm install, npm run build, rsync to /var/www
```

DNS for `example.invalid` is a Cloudflare-proxied A record pointing at
this server, with a Cloudflare Access policy (email-OTP) in front of it for
`user@example.invalid` and `user@example.invalid`. Because Access
gates *every* path on the hostname — including `/.well-known/acme-challenge/`
— a normal Let's Encrypt HTTP-01 challenge can never reach the origin through
the proxy. TLS at the origin therefore uses a **Cloudflare Origin CA
certificate** instead (`/etc/ssl/example.invalid/`, issued straight
from the Cloudflare API, valid until 2041, not renewal-dependent on Access).
Zone SSL mode is "Full", so Cloudflare validates that the origin presents
*some* cert (this one) without needing public CA trust.

nginx config: `/etc/nginx/sites-available/example.invalid`. Sets
`Cross-Origin-Opener-Policy`/`Cross-Origin-Embedder-Policy` explicitly in
every `location` block that serves content (nginx doesn't inherit `add_header`
into a `location` once that block sets its own) — required for the
multi-threaded Stockfish build's `SharedArrayBuffer` usage.

A Cloudflare Worker (`chess-analyzer`) from an earlier iteration of this
deployment still exists on the account but is no longer routed to the domain
(safe to delete whenever).
