# review-for-agent

A local code review tool for giving structured, line-level feedback to AI coding agents — without opening a PR.

Review uncommitted changes in a GitHub-style diff view, leave inline comments, and export a Markdown file you can feed directly back to your AI agent.

![review-for-agent UI showing a code review with inline comments on a diff](docs/usage.jpeg)

## Why

After an AI coding agent edits files in your repo, there's no lightweight way to give it precise, line-level feedback. Opening a GitHub PR just to leave review comments on local changes is overkill. Copy-pasting file paths and line numbers into chat is error-prone and loses context.

**review-for-agent** gives you a familiar PR review UI that runs entirely on your machine and outputs a structured Markdown file the agent can consume.

## Features

- **GitHub-style diff view** — unified or split, powered by [diff2html](https://diff2html.xyz/)
- **Inline comments** — click a line number to comment; shift-click to select a range
- **File-level comments** — feedback on an entire file, not tied to a specific line
- **Global review comment** — overall feedback at the top of the review
- **Structured export** — outputs both JSON and agent-friendly Markdown with diff context snippets
- **Clipboard integration** — copies `review my comments on these changes in @rfa/comments_xxxx.md` to your clipboard on submit, ready to paste into your agent
- **Local** — no GitHub, no PRs. Single binary, runs from your repo root. Requires internet only for CDN-hosted frontend assets (diff2html, highlight.js)

## Install

### From source

Requires [Go 1.23+](https://go.dev/dl/).

```sh
go install github.com/Waraq-Labs/review-for-agent@latest
```

### Build locally

```sh
git clone https://github.com/Waraq-Labs/review-for-agent.git
cd review-for-agent
go build -o review-for-agent .
```

## Usage

Run from the root of any Git repo with uncommitted changes:

```
$ review-for-agent
Listening on localhost:4000
Opening http://localhost:4000/review
```

Your browser opens with a diff of all uncommitted changes. Leave comments, then click **Submit Review**.

```
Wrote rfa/comments_5ae2.json
Wrote rfa/comments_5ae2.md
```

The Markdown file path is copied to your clipboard as:

```
review my comments on these changes in @rfa/comments_5ae2.md
```

Paste that into your AI agent's chat to have it address your feedback.

### Flags

| Flag | Description |
|------|-------------|
| `--no-open` | Don't auto-open the browser (useful when re-running and refreshing an already open tab) |

### Reviewing changes

1. **Click a line number** to add a single-line comment
2. **Click a line, then shift-click another** to comment on a range
3. **Click "+ File comment"** in a file header for file-level feedback
4. **Type a global comment** in the textarea at the bottom
5. **Click "Submit Review"** to export

### Port selection

The server tries port 4000 first, then increments until it finds a free port.

## Output

Comments are written to the `rfa/` directory (created if it doesn't exist).

### Markdown format

The Markdown file is designed to be consumed by AI agents. It includes a preamble explaining the file structure, then comments grouped by file with diff context snippets:

```markdown
# Code Review Comments

> **How to read this file:**
> This file contains review comments on uncommitted changes in this repo.
> Comments are grouped by file. Each comment includes a line or line range
> reference and a quoted diff context snippet showing the relevant code.
> File-level comments (not tied to a specific line) appear under a
> "(file-level)" heading. A global comment, if present, appears at the top
> before any file sections.

Overall, nice progress but a few things to address.

## src/api/handler.ts

### Line 42
> +  const result = await fetch(url);
Add error handling here — what happens if the fetch fails?

### Lines 78–85
> +  if (user.role === 'admin') {
> +    grantAll(user);
> +  }
This grants blanket permissions. Should we scope this to the specific resource?

## src/utils/parse.ts (file-level)
This file duplicates logic from src/core/parser.ts — consider consolidating.
```

### JSON format

The JSON file contains the raw structured data for programmatic use:

```json
{
  "globalComment": "Overall, nice progress but a few things to address.",
  "comments": [
    {
      "file": "src/api/handler.ts",
      "startLine": 42,
      "endLine": 42,
      "side": "right",
      "body": "Add error handling here — what happens if the fetch fails?"
    }
  ]
}
```

## Requirements

- Git
- A modern web browser

## License

MIT
