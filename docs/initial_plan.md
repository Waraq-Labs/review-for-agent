# review-for-agent — Project Plan

## Overview

A CLI tool that launches a local web-based code review interface for Git diffs. Designed for developers working with AI coding agents — review the agent's changes in a visual diff viewer, leave inline comments, and generate structured output files that can be fed back to the agent.

**Install:** `brew install review-for-agent`
**Run:** `review-for-agent` (inside any Git repo)

---

## User Experience

```
$ cd my-project
$ review-for-agent

✔ Detected git repository
✔ Found 4 changed files (12 additions, 3 deletions)
Starting server at http://localhost:5873
Opening browser...

# Browser opens → user reviews diff, leaves comments, clicks "Submit Review"

✔ Comments submitted (7 comments across 3 files)
  → rfa/comments_a8f3c2.json
  → rfa/instructions_a8f3c2.md
```

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--port` | `5873` | HTTP server port |
| `--ref` | _(working tree)_ | Diff reference, e.g. `HEAD~3..HEAD`, `main..feature` |
| `--staged` | `false` | Review only staged changes (`git diff --cached`) |
| `--no-open` | `false` | Don't auto-open the browser |
| `--output-dir` | `./rfa` | Directory for output files |

---

## Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Language | **Go** | Single static binary, `go:embed` for frontend, trivial cross-compilation |
| HTTP server | `net/http` (stdlib) | No dependencies needed |
| Git interaction | `os/exec` → `git diff` | Shell out to the user's installed Git |
| Frontend | **HTML + Vanilla JS** | Single embedded file, no build step |
| Diff rendering | **diff2html** (CDN) | Parses unified diff → rich HTML with syntax highlighting |
| Styling | **Tailwind CSS** (CDN) | Utility classes, no build step |
| Distribution | **GoReleaser + Homebrew Tap** | Automated cross-platform releases |

---

## Architecture

### Project Structure

```
review-for-agent/
├── main.go                    # Entry point: arg parsing, lifecycle orchestration
├── git.go                     # Git operations (diff, repo detection, metadata)
├── server.go                  # HTTP server, route registration, shutdown
├── handlers.go                # API endpoint handlers
├── output.go                  # File writing (JSON comments, MD instructions)
├── browser.go                 # Cross-platform browser opening
├── frontend/
│   └── index.html             # Single-file SPA (HTML + JS + CSS)
├── go.mod
├── go.sum
├── .goreleaser.yml
├── LICENSE
└── README.md
```

### Application Lifecycle

```
main.go
  │
  ├─ 1. Parse CLI flags
  ├─ 2. Verify Git repo (git rev-parse --git-dir)
  ├─ 3. Run git diff, capture output
  ├─ 4. Generate session ID (6-char random hex)
  ├─ 5. Start HTTP server (goroutine)
  ├─ 6. Open browser (goroutine)
  ├─ 7. Block on completion channel ← ─ ─ ─ ─ ─ ┐
  ├─ 8. Write output files                       │
  ├─ 9. Print summary to terminal                │
  └─ 10. Shutdown server, exit                    │
                                                  │
handlers.go                                       │
  POST /api/comments/submit  ── sends signal ── ─ ┘
```

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves the embedded `index.html` |
| `GET` | `/api/diff` | Returns the raw unified diff string as JSON |
| `GET` | `/api/meta` | Returns repo name, branch, ref range, file count |
| `POST` | `/api/comments/submit` | Receives all comments, triggers shutdown |

### Frontend Behavior

The frontend is a single `index.html` file embedded into the binary via `go:embed`. On load, it fetches the diff from `/api/diff`, renders it using diff2html in side-by-side mode, and attaches click handlers to each diff line for inline commenting.

**Key interactions:**

1. **Page load** → `GET /api/diff` and `GET /api/meta` → render diff with diff2html
2. **Click a diff line** → inline comment textarea appears below that line
3. **Write comment + press Enter** → comment is stored in local JS state, badge appears on the line
4. **Click existing badge** → edit or delete the comment
5. **Click "Submit Review"** → `POST /api/comments/submit` with all comments → server writes files and shuts down
6. **After submit** → frontend shows confirmation message: "Review saved. You can close this tab."

**diff2html configuration:**

```js
const diffHtml = Diff2Html.html(rawDiff, {
  drawFileList: true,
  matching: 'lines',
  outputFormat: 'side-by-side',
  highlight: true,
  fileListToggle: true,
});
```

**Comment attachment strategy:** diff2html renders each line as a `<tr>` with a `data-line` attribute. After rendering, the app attaches click listeners to each row. When a comment is added, a new `<tr>` is inserted below the target row containing the comment UI. Comments are tracked in a JS Map keyed by `{file, line, side}`.

---

## Output Files

### Comments JSON — `rfa/comments_<id>.json`

```json
{
  "session_id": "a8f3c2",
  "created_at": "2026-02-09T14:30:00Z",
  "repository": "my-project",
  "branch": "feature/new-api",
  "diff_ref": "working tree",
  "total_comments": 7,
  "files_commented": 3,
  "comments": [
    {
      "file": "src/handlers/auth.go",
      "line": 42,
      "side": "right",
      "body": "This doesn't handle the case where the token is expired. Add a check before proceeding.",
      "timestamp": "2026-02-09T14:28:12Z"
    },
    {
      "file": "src/handlers/auth.go",
      "line": 58,
      "side": "right",
      "body": "Rename this variable to something more descriptive than 'x'.",
      "timestamp": "2026-02-09T14:28:45Z"
    }
  ]
}
```

### Agent Instructions — `rfa/instructions_<id>.md`

This file is a self-contained prompt/instructions document that can be given directly to an AI agent. It contains:

```markdown
# Code Review Feedback

You are receiving feedback from a human code review of your recent changes.
Below is a structured set of comments tied to specific files and line numbers
in the current diff.

## How to Read This

- Each comment targets a specific file and line number in the diff
- The "side" field indicates whether the comment refers to the old (left/removed)
  or new (right/added) version of the line
- Apply the requested changes, then re-run the diff to verify

## Review Details

- **Repository:** my-project
- **Branch:** feature/new-api
- **Diff reference:** working tree
- **Review date:** 2026-02-09T14:30:00Z
- **Total comments:** 7

## Comments

### src/handlers/auth.go

**Line 42 (new):**
This doesn't handle the case where the token is expired. Add a check
before proceeding.

**Line 58 (new):**
Rename this variable to something more descriptive than 'x'.

### src/models/user.go

...

## Source Data

The structured JSON data for this review is available at:
`rfa/comments_a8f3c2.json`
```

---

## Distribution

### GoReleaser Configuration

GoReleaser handles cross-compilation and Homebrew formula generation. On each GitHub release tag, a GitHub Action runs GoReleaser which builds binaries for all platforms, creates a GitHub release with attached archives, and updates the Homebrew tap formula.

**Target platforms:**

- macOS (arm64, amd64)
- Linux (arm64, amd64)
- Windows (amd64)

### Homebrew Tap

A separate GitHub repository (`<username>/homebrew-tap`) hosts the Homebrew formula. GoReleaser auto-updates it on each release.

```
brew tap <username>/tap
brew install review-for-agent
```

---

## Development Phases

### Phase 1 — Core MVP

- Git repo detection and `git diff` capture
- HTTP server with embedded frontend
- diff2html rendering of the diff
- Inline commenting UI (click line → add comment)
- Submit → write `comments_<id>.json`
- Auto-open browser, auto-shutdown on submit
- Basic CLI flags (`--port`, `--staged`, `--ref`)

### Phase 2 — Polish

- Generate `instructions_<id>.md` alongside JSON
- File list sidebar with comment count badges
- Keyboard shortcuts (n/p to navigate files, Ctrl+Enter to save comment)
- General comment box (not tied to a specific line)
- `--output-dir` flag
- Error handling and user-friendly terminal output

### Phase 3 — Distribution

- GoReleaser configuration
- GitHub Actions CI/CD pipeline
- Homebrew tap setup
- README with installation and usage docs

### Phase 4 — Nice-to-Haves

- Dark/light theme toggle (respect system preference)
- Collapse/expand files
- Comment severity levels (suggestion, important, critical)
- `--watch` mode for re-running on file changes
- Support for `git diff` between arbitrary commits/branches
- Markdown preview in comments
