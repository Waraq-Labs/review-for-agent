# reviews-for-an-agent — Shaping Doc

## Source

> I would like to create a CLI app called 'reviews-for-an-agent'. It will help me provide feedback to AI coding agents like Claude after they have edited code files in a Git repo.
>
> The app will allow me to review the changes with Github style PR comments without having to open a PR on Github. It's a local only app.
>
> ```
> $> reviews-for-agent start
> Listening on localhost:4000
> Opening localhost:4000/review
>
> [POST] Received comments on localhost:4000/comments
> Wrote comments to rfa/comments_5ae2.json and rfa/comments_5ae2.md. Provide the MD file to your AI agent to have it address the comments.
> ```

---

## Frame

### Problem

- After an AI coding agent makes changes to a repo, there's no lightweight way to give it structured, line-level feedback on the diff
- Opening a PR on GitHub just to leave review comments for a local AI agent is overkill and adds friction
- Copy-pasting file paths and line numbers into a chat is error-prone and lacks context

### Outcome

- A developer can review an AI agent's uncommitted changes in a familiar GitHub-style diff UI, leave inline comments, and produce a structured feedback file that can be fed directly back to the agent

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | Review uncommitted changes in a GitHub-style diff view | Core goal |
| R1 | Add inline comments on specific lines or line ranges of the diff | Core goal |
| R2 | Add file-level comments (not tied to a specific line) | Core goal |
| R3 | Export comments to a structured file an AI agent can consume | Core goal |
| R4 | Local only — no GitHub, no network, no PRs | Must-have |
| R5 | Single CLI command to start from repo root | Must-have |
| R6 | Diff is always computed against HEAD (uncommitted changes only) | Must-have |
| R7 | Auto-open browser when server starts | Nice-to-have |
| R8 | Output both JSON and agent-friendly MD formats | Must-have |
| R9 | Use diff2html for diff rendering | Must-have |
| R10 | Built in Go, distributed as single binary | Must-have |
| R11 | One review round per invocation — re-run for subsequent rounds | Must-have |
| R12 | MD output includes diff context snippets so agent can locate each comment | Must-have |
| R13 | Add a global review-level comment not tied to any file | Nice-to-have |
| R14 | CLI flag to suppress auto-opening the browser (`--no-open`) | Nice-to-have |

---

## Selected Shape: A — Local Go HTTP server with diff2html frontend

### Parts

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **CLI entry point** — Go binary with `start` subcommand. Starts `net/http` server on `:4000`. Calls `open`/`xdg-open` to launch browser at `/review` unless `--no-open` flag is passed | |
| **A2** | **Git diff engine** — `exec.Command("git", "diff", "HEAD")` captures unified diff as string, served via `GET /api/diff` | |
| **A3** | **Diff renderer** — Single HTML page with diff2html JS/CSS from CDN. Fetches diff from `/api/diff`, renders split/unified view | |
| **A4** | **Comment UI** — Custom JS layer on top of diff2html DOM. Click gutter line number → single-line comment. Shift-click second line → range. "Add file comment" button per file header. Comments render as inline cards below target line | |
| **A5** | **Submit endpoint** — `POST /api/comments` receives JSON payload with optional global comment and comment array. Server writes `rfa/comments_{hash}.json` and `rfa/comments_{hash}.md`. Returns paths in response. Server logs output paths to terminal | |
| **A6** | **MD formatter** — Global comment rendered as plain text immediately after the heading. File comments grouped by file, each with line/range reference, quoted diff context snippet (from unified diff), and comment body. File-level comments under "(file-level)" sub-header | |

### Fit Check (R × A)

| Req | Requirement | Status | A |
|-----|-------------|--------|---|
| R0 | Review uncommitted changes in a GitHub-style diff view | Core goal | ✅ |
| R1 | Add inline comments on specific lines or line ranges of the diff | Core goal | ✅ |
| R2 | Add file-level comments (not tied to a specific line) | Core goal | ✅ |
| R3 | Export comments to a structured file an AI agent can consume | Core goal | ✅ |
| R4 | Local only — no GitHub, no network, no PRs | Must-have | ✅ |
| R5 | Single CLI command to start from repo root | Must-have | ✅ |
| R6 | Diff is always computed against HEAD (uncommitted changes only) | Must-have | ✅ |
| R7 | Auto-open browser when server starts | Nice-to-have | ✅ |
| R8 | Output both JSON and agent-friendly MD formats | Must-have | ✅ |
| R9 | Use diff2html for diff rendering | Must-have | ✅ |
| R10 | Built in Go, distributed as single binary | Must-have | ✅ |
| R11 | One review round per invocation — re-run for subsequent rounds | Must-have | ✅ |
| R12 | MD output includes diff context snippets so agent can locate each comment | Must-have | ✅ |
| R13 | Add a global review-level comment not tied to any file | Nice-to-have | ✅ |
| R14 | CLI flag to suppress auto-opening the browser (`--no-open`) | Nice-to-have | ✅ |

### Comment Data Model

```
ReviewSubmission {
  globalComment: string | null   // review-level comment, not tied to any file
  comments:      Comment[]       // file/line comments
}

Comment {
  file:       string          // "src/api/handler.ts"
  startLine:  int | null      // null for file-level comments
  endLine:    int | null      // same as startLine for single-line, null for file-level
  side:       "left"|"right"  // old vs new side of diff
  body:       string          // the comment text
}
```

### MD Output Format

```markdown
# Code Review Comments

Overall, nice progress but a few things to address before this is ready.

## src/api/handler.ts

### Line 42
> +  const result = await fetch(url);
Add error handling here — what happens if the fetch fails?

### Lines 78-85
> +  if (user.role === 'admin') {
> +    grantAll(user);
> +  }
This grants blanket permissions. Should we scope this to the specific resource?

## src/utils/parse.ts (file-level)
This file duplicates logic from src/core/parser.ts — consider consolidating.
```

---

## Slices

| # | Slice | Parts | Demo |
|---|-------|-------|------|
| V1 | Diff renders in browser | A1, A2, A3 | "Run `reviews-for-agent start`, browser opens, see GitHub-style diff of uncommitted changes" |
| V2 | Single-line comments | A4 (partial) | "Click a line number in the diff, type a comment, see it appear inline below the line" |
| V3 | Range + file-level comments | A4 (remainder) | "Shift-click to select a range, add comment. Click file-level button, add comment" |
| V4 | Submit + export | A5, A6 | "Click Submit Review, see JSON + MD files written to `rfa/`, open MD file and verify format" |

---

### V1: DIFF RENDERS IN BROWSER

**What we build:**
- Go project scaffolding with `go.mod`, main entry point
- `start` subcommand that launches an HTTP server on `:4000`
- `--no-open` flag to suppress auto-opening the browser
- `GET /api/diff` endpoint that runs `git diff HEAD` and returns the unified diff as plain text
- Single HTML page served at `/review` that fetches the diff and renders it with diff2html
- Auto-opens the browser on startup (unless `--no-open` is passed)
- diff2html JS/CSS loaded from CDN (no need to embed yet)

**Key decisions:**
- Use `net/http` from stdlib (no framework needed)
- HTML/JS/CSS served as embedded files via Go's `embed` package
- diff2html loaded from `cdnjs.cloudflare.com` — keeps the binary small
- Unified view as default, with a toggle for split view

**Demo:** Run `reviews-for-agent start` from a repo with uncommitted changes. Browser opens. You see the diff rendered in GitHub-style.

---

### V2: SINGLE-LINE COMMENTS

**What we build:**
- JS click handler on diff2html's line number gutter elements
- When a line is clicked, inject a comment form (textarea + Save/Cancel buttons) below the target row
- On Save, store the comment in a client-side JS array
- Render saved comments as styled cards below their target line (similar to GitHub PR comments)
- Comment card shows: file path, line number, comment body, and a Delete button

**Key decisions:**
- Comments stored entirely client-side until Submit (V4)
- diff2html renders `<td>` elements with line numbers — attach click handlers via event delegation on the diff container
- Each comment card is a `<div>` injected as a new `<tr>` after the target line's `<tr>`

**Demo:** Click a line number in the diff. A form appears. Type a comment, click Save. The comment renders inline. Delete it. Add another.

---

### V3: RANGE + FILE-LEVEL COMMENTS

**What we build:**
- Range selection: click first line number, shift-click second line number → highlights the range, opens comment form
- Visual highlight on the selected range (background color on those rows)
- File-level comment: inject an "Add file comment" button into each diff2html file header
- Clicking it opens a comment form not tied to any line
- File-level comments rendered at the top of the file's diff section

**Key decisions:**
- Track "first click" state in JS — if shift is held on second click, treat as range
- Range must be within the same file
- File-level comments use `startLine: null, endLine: null` in the data model

**Demo:** Click line 10, shift-click line 15 — range highlights, form opens. Save the range comment. Click "Add file comment" on a file header, add a comment. Both types render correctly.

---

### V4: SUBMIT + EXPORT

**What we build:**
- Global comment textarea at the bottom of the page, near the Submit button — for review-level feedback not tied to any file
- "Submit Review" button fixed at the bottom of the page (visible comment count badge)
- On click, POST global comment + all comments as JSON to `POST /api/comments`
- Go server receives the comments, generates a short hash (first 4 bytes of SHA256 of timestamp)
- Writes `rfa/comments_{hash}.json` (raw structured data)
- Writes `rfa/comments_{hash}.md` (agent-friendly format with diff context snippets)
- Server logs the output paths to the terminal
- Returns the file paths in the HTTP response, UI shows a success message with the paths
- MD formatter: renders global comment at the top, then parses the unified diff to extract context lines around each comment's line reference

**Key decisions:**
- `rfa/` directory created automatically if it doesn't exist
- MD formatter needs access to the original unified diff to pull context snippets — server caches the diff output from V1
- After successful submit, disable the Submit button and show "Review submitted" state
- Server does NOT shut down after submit — user closes it manually (Ctrl+C)

**Demo:** Add a few comments (single-line, range, file-level). Type a global comment. Click Submit Review. Check terminal — paths are logged. Open the MD file — global comment at the top, then comments grouped by file with diff context snippets. Open the JSON — structured data.
