package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

type Comment struct {
	File      string `json:"file"`
	StartLine *int   `json:"startLine"`
	EndLine   *int   `json:"endLine"`
	Side      string `json:"side"`
	Body      string `json:"body"`
}

type DiffLine struct {
	OldLineNo int
	NewLineNo int
	Content   string
}

type SubmitRequest struct {
	Diff     string    `json:"diff"`
	Comments []Comment `json:"comments"`
}

func handleComments(w http.ResponseWriter, r *http.Request) {
	var req SubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	comments := req.Comments
	diff := req.Diff

	hash := sha256.Sum256([]byte(time.Now().String()))
	hashStr := fmt.Sprintf("%x", hash[:4])

	if err := os.MkdirAll("rfa", 0o755); err != nil {
		http.Error(w, "failed to create rfa directory: "+err.Error(), http.StatusInternalServerError)
		return
	}

	jsonPath := "rfa/comments_" + hashStr + ".json"
	mdPath := "rfa/comments_" + hashStr + ".md"

	jsonData, err := json.MarshalIndent(comments, "", "  ")
	if err != nil {
		http.Error(w, "failed to marshal JSON: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(jsonPath, jsonData, 0o644); err != nil {
		http.Error(w, "failed to write JSON file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	mdContent := formatMarkdown(comments, diff)
	if err := os.WriteFile(mdPath, []byte(mdContent), 0o644); err != nil {
		http.Error(w, "failed to write markdown file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	fmt.Printf("Wrote %s\n", jsonPath)
	fmt.Printf("Wrote %s\n", mdPath)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"jsonPath": jsonPath,
		"mdPath":   mdPath,
	})
}

func formatMarkdown(comments []Comment, diff string) string {
	diffLines := parseDiffLines(diff)

	type fileComments struct {
		fileLevel []Comment
		lined     []Comment
	}

	ordered := []string{}
	grouped := map[string]*fileComments{}

	for _, c := range comments {
		fc, ok := grouped[c.File]
		if !ok {
			fc = &fileComments{}
			grouped[c.File] = fc
			ordered = append(ordered, c.File)
		}
		if c.StartLine == nil {
			fc.fileLevel = append(fc.fileLevel, c)
		} else {
			fc.lined = append(fc.lined, c)
		}
	}

	var sb strings.Builder
	sb.WriteString("# Code Review Comments\n")

	for _, file := range ordered {
		fc := grouped[file]

		if len(fc.lined) > 0 {
			sb.WriteString("\n## " + file + "\n")
			lines := diffLines[file]
			for _, c := range fc.lined {
				start := *c.StartLine
				end := start
				if c.EndLine != nil {
					end = *c.EndLine
				}

				if start == end {
					sb.WriteString("\n### Line " + strconv.Itoa(start) + "\n")
				} else {
					sb.WriteString("\n### Lines " + strconv.Itoa(start) + "\u2013" + strconv.Itoa(end) + "\n")
				}

				for _, dl := range lines {
					lineNo := dl.NewLineNo
					if c.Side == "left" {
						lineNo = dl.OldLineNo
					}
					if lineNo >= start && lineNo <= end {
						sb.WriteString("> " + dl.Content + "\n")
					}
				}
				sb.WriteString(c.Body + "\n")
			}
		}

		if len(fc.fileLevel) > 0 {
			sb.WriteString("\n## " + file + " (file-level)\n")
			for _, c := range fc.fileLevel {
				sb.WriteString(c.Body + "\n")
			}
		}
	}

	return sb.String()
}

func parseDiffLines(diff string) map[string][]DiffLine {
	result := map[string][]DiffLine{}
	lines := strings.Split(diff, "\n")

	var currentFile string
	oldLine, newLine := 0, 0

	for _, line := range lines {
		if strings.HasPrefix(line, "+++ b/") {
			currentFile = strings.TrimPrefix(line, "+++ b/")
			continue
		}
		if strings.HasPrefix(line, "--- ") {
			continue
		}
		if strings.HasPrefix(line, "diff --git") {
			continue
		}
		if strings.HasPrefix(line, "index ") || strings.HasPrefix(line, "new file") || strings.HasPrefix(line, "deleted file") {
			continue
		}
		if strings.HasPrefix(line, "@@ ") {
			parts := strings.SplitN(line, "@@", 3)
			if len(parts) >= 2 {
				header := strings.TrimSpace(parts[1])
				ranges := strings.Fields(header)
				for _, r := range ranges {
					if strings.HasPrefix(r, "-") {
						nums := strings.SplitN(r[1:], ",", 2)
						oldLine, _ = strconv.Atoi(nums[0])
					} else if strings.HasPrefix(r, "+") {
						nums := strings.SplitN(r[1:], ",", 2)
						newLine, _ = strconv.Atoi(nums[0])
					}
				}
			}
			continue
		}
		if currentFile == "" {
			continue
		}
		if strings.HasPrefix(line, "-") {
			result[currentFile] = append(result[currentFile], DiffLine{
				OldLineNo: oldLine,
				NewLineNo: 0,
				Content:   line,
			})
			oldLine++
		} else if strings.HasPrefix(line, "+") {
			result[currentFile] = append(result[currentFile], DiffLine{
				OldLineNo: 0,
				NewLineNo: newLine,
				Content:   line,
			})
			newLine++
		} else if strings.HasPrefix(line, " ") || line == "" {
			result[currentFile] = append(result[currentFile], DiffLine{
				OldLineNo: oldLine,
				NewLineNo: newLine,
				Content:   line,
			})
			oldLine++
			newLine++
		}
	}

	return result
}
