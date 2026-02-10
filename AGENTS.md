# AGENTS.md — review-for-agent

## What This Is

A local-only CLI tool that lets developers review an AI agent's uncommitted Git changes in a GitHub-style diff UI, leave inline comments, and export structured feedback (JSON + Markdown) for the agent to consume. See `docs/shaping.md` for the full product spec.

## Commands

```sh
# Build
go build -o review-for-agent .

# Run
./review-for-agent              # starts server, opens browser
./review-for-agent --no-open    # starts server, no browser

# Typecheck / vet
go vet ./...
```

There are no tests yet. No external Go dependencies — stdlib only.

## Architecture

Single Go binary with an embedded web frontend. No frameworks, no routers — just `net/http` from stdlib.

### Go files (package `main`)

| File | Responsibility |
|------|---------------|
| `main.go` | CLI entry point, `--no-open` flag, port discovery (tries 4000+), browser launch |
| `server.go` | HTTP mux: `GET /review`, `GET /api/diff`, `POST /api/comments`, static file serving. Embeds `web/` via `go:embed` |
| `diff.go` | Runs `git diff HEAD` + synthesizes diffs for untracked files. Returns unified diff string |
| `comments.go` | `POST /api/comments` handler. Data model (`Comment`, `SubmitRequest`), JSON/MD file writer, unified diff parser (`parseDiffLines`), MD formatter |

### Web files (embedded via `go:embed web`)

| File | Responsibility |
|------|---------------|
| `web/review.html` | Single page shell. Loads diff2html + highlight.js from CDN |
| `web/review.js` | All client logic: diff rendering (diff2html), comment forms (line, range, file-level), submit flow, clipboard copy |
| `web/review.css` | Dark theme styles, diff2html overrides, comment card/form styles |

### Data flow

```
CLI start → find free port → start HTTP server → browser opens /review
  → JS fetches GET /api/diff → renders with diff2html
  → user adds comments (stored client-side)
  → user clicks Submit → POST /api/comments (sends diff + comments)
  → server writes rfa/comments_{hash}.json + .md
  → response includes clipboardText → JS copies to clipboard
```

### Output directory

`rfa/` — auto-created, gitignored. Contains `comments_{hash}.json` and `comments_{hash}.md` pairs.

## Code Conventions

- Go: stdlib only, no external deps. Flat package (`package main`), no subdirectories for Go code
- Web: vanilla JS (no build step, no modules, no framework). ES5-style `var` and `function` declarations throughout — follow this pattern
- CSS: custom properties in `:root`, BEM-ish class names prefixed with `rfa-` for custom elements, `d2h-` overrides for diff2html
- No comments in code unless complexity demands it
- diff2html and highlight.js loaded from CDN, not vendored
