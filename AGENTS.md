# AGENTS.md — review-for-agent

## What This Is

A local-only CLI tool that lets developers review an AI agent's uncommitted Git changes in a GitHub-style diff UI, leave inline comments, and export structured feedback (JSON + Markdown) for the agent to consume. See `docs/shaping.md` for the full product spec.

## Commands

```sh
# Setup frontend deps
make setup

# Frontend dev server (Vite, proxies /api to :4000)
make dev-web

# API dev server
make dev-api

# Build frontend bundle + Go binary
make build

# Build frontend only
make build-frontend

# Run
./review-for-agent              # starts server, opens browser
./review-for-agent --no-open    # starts server, no browser

# Verify generated frontend/build is current
make verify-frontend-build

# Go checks
go vet ./...
```

There are no tests yet. No external Go dependencies — stdlib only.

## Architecture

Single Go binary with an embedded web frontend bundle. No Go frameworks, no routers — just `net/http` from stdlib.

### Go files (package `main`)

| File | Responsibility |
|------|---------------|
| `main.go` | CLI entry point, `--no-open` flag, port discovery (tries 4000+), browser launch |
| `server.go` | HTTP mux: `GET /review`, `GET /api/diff`, `POST /api/comments`, static file serving. Embeds `frontend/build/` via `go:embed` |
| `diff.go` | Runs `git diff HEAD` + synthesizes diffs for untracked files. Returns unified diff string |
| `comments.go` | `POST /api/comments` handler. Data model (`Comment`, `SubmitRequest`), JSON/MD file writer, unified diff parser (`parseDiffLines`), MD formatter |

### Frontend files (`frontend/`, built by Vite)

| File | Responsibility |
|------|---------------|
| `frontend/src/App.tsx` | Review UI and client state (view toggle, line/range/file/global comments, submit flow, clipboard copy) |
| `frontend/src/diffAdapter.ts` | Integration adapter around `@pierre/diffs` parsing/annotation/selection side mapping |
| `frontend/src/api.ts` | Fetch wrapper for `GET /api/diff` and `POST /api/comments` |
| `frontend/src/styles.css` | App + annotation/form styling |
| `frontend/vite.config.ts` | Build config (`/static/` base, `build` outDir) and dev proxy |
| `frontend/build/*` | Generated static bundle embedded in Go binary |

### Data flow

```
CLI start → find free port → start HTTP server → browser opens /review
  → React app fetches GET /api/diff → parses patch and renders with @pierre/diffs
  → user adds comments (stored client-side)
  → user clicks Submit → POST /api/comments (sends diff + comments)
  → server writes rfa/comments_{hash}.json + .md
  → response includes clipboardText → JS copies to clipboard
```

### Output directory

`rfa/` — auto-created, gitignored. Contains `comments_{hash}.json` and `comments_{hash}.md` pairs.

### Ignore file

`.rfaignore` at repo root is read on startup and used to exclude paths from both tracked and untracked diff generation.
`package-lock.json` and `pnpm-lock.yaml` are always excluded by the backend even without `.rfaignore`.

## Code Conventions

- Go: stdlib only, no external deps. Flat package (`package main`), no subdirectories for Go code
- Frontend: React + TypeScript in `frontend/src/`, built with Vite and managed with pnpm
- Keep `@pierre/diffs` integration details inside `frontend/src/diffAdapter.ts` to isolate vendor-specific logic
- CSS: custom properties in `:root`, `rfa-` prefix for app-specific classes
- No comments in code unless complexity demands it
