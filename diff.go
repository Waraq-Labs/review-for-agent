package main

import (
	"fmt"
	"os/exec"
	"strings"
)

func getGitDiff() (string, error) {
	// Tracked file changes (staged + unstaged vs HEAD)
	cmd := exec.Command("git", "diff", "HEAD")
	tracked, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git diff HEAD failed: %w", err)
	}

	// Untracked files
	cmd = exec.Command("git", "ls-files", "--others", "--exclude-standard")
	untrackedList, err := cmd.Output()
	if err != nil {
		return string(tracked), nil // non-fatal: just return tracked diff
	}

	var result strings.Builder
	result.Write(tracked)

	files := strings.Split(strings.TrimSpace(string(untrackedList)), "\n")
	for _, f := range files {
		if f == "" {
			continue
		}
		// git diff --no-index exits 1 when there are differences, so ignore the error
		cmd = exec.Command("git", "diff", "--no-index", "/dev/null", f)
		out, _ := cmd.Output()
		result.Write(out)
	}

	return result.String(), nil
}
