package main

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

var rfaIgnorePathspecExcludes []string
var rfaIgnoreExcludeFile string

var alwaysIgnoredPatterns = []string{
	"**/package-lock.json",
	"**/pnpm-lock.yaml",
}

func configureRFAIgnore(path string) (int, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			rfaIgnorePathspecExcludes = nil
			rfaIgnoreExcludeFile = ""
			return 0, nil
		}
		return 0, fmt.Errorf("open %s: %w", path, err)
	}
	defer file.Close()

	patterns := make([]string, 0)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		patterns = append(patterns, line)
	}
	if err := scanner.Err(); err != nil {
		return 0, fmt.Errorf("read %s: %w", path, err)
	}

	rfaIgnorePathspecExcludes = buildPathspecExcludes(patterns)
	if len(patterns) > 0 {
		rfaIgnoreExcludeFile = path
	} else {
		rfaIgnoreExcludeFile = ""
	}
	return len(patterns), nil
}

func buildPathspecExcludes(patterns []string) []string {
	excludes := make([]string, 0, len(patterns))
	for _, pattern := range patterns {
		p := strings.TrimSpace(pattern)
		p = strings.TrimPrefix(p, "./")
		p = strings.TrimPrefix(p, "/")
		if p == "" {
			continue
		}
		if strings.HasSuffix(p, "/") {
			p += "**"
		}
		excludes = append(excludes, ":(exclude,glob,top)"+p)
	}
	return excludes
}

func trackedDiffArgs() []string {
	args := []string{"diff", "HEAD"}
	excludes := make([]string, 0, len(alwaysIgnoredPatterns)+len(rfaIgnorePathspecExcludes))
	excludes = append(excludes, buildPathspecExcludes(alwaysIgnoredPatterns)...)
	excludes = append(excludes, rfaIgnorePathspecExcludes...)
	if len(excludes) == 0 {
		return args
	}
	args = append(args, "--", ".")
	args = append(args, excludes...)
	return args
}

func untrackedListArgs() []string {
	args := []string{"ls-files", "--others", "--exclude-standard"}
	for _, pattern := range alwaysIgnoredPatterns {
		args = append(args, "--exclude", pattern)
	}
	if rfaIgnoreExcludeFile != "" {
		args = append(args, "--exclude-from", rfaIgnoreExcludeFile)
	}
	return args
}

func getGitDiff() (string, error) {
	// Tracked file changes (staged + unstaged vs HEAD)
	cmd := exec.Command("git", trackedDiffArgs()...)
	tracked, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git diff HEAD failed: %w", err)
	}

	// Untracked files
	cmd = exec.Command("git", untrackedListArgs()...)
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
