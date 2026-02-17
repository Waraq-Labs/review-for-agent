package main

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "sample-template" {
		if err := runSampleTemplateCommand(os.Args[2:]); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	args := os.Args[1:]
	if len(args) > 0 && args[0] == "start" {
		args = args[1:]
	}

	if err := runServerCommand(args); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func runServerCommand(args []string) error {
	fs := flag.NewFlagSet("review-for-agent", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	noOpen := fs.Bool("no-open", false, "suppress auto-opening the browser")
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if fs.NArg() > 0 {
		if fs.NArg() != 1 || fs.Arg(0) != "start" {
			return fmt.Errorf("unexpected argument: %s", fs.Arg(0))
		}
	}

	ignoreCount, err := configureRFAIgnore(".rfaignore")
	if err != nil {
		return fmt.Errorf("failed to load .rfaignore: %w", err)
	}
	if ignoreCount > 0 {
		fmt.Printf("Loaded %d .rfaignore pattern(s)\n", ignoreCount)
	}

	host := strings.TrimSpace(os.Getenv("RFA_HOST"))

	port, err := freePort(host)
	if err != nil {
		return fmt.Errorf("failed to find free port: %w", err)
	}

	addr := net.JoinHostPort(host, strconv.Itoa(port))
	printHost := host
	displayHost := host
	if host == "" {
		printHost = "localhost"
		displayHost = "localhost"
	} else if host == "0.0.0.0" {
		displayHost = "localhost"
	}
	displayAddr := net.JoinHostPort(displayHost, strconv.Itoa(port))
	url := fmt.Sprintf("http://%s/review", displayAddr)

	fmt.Printf("Listening on %s\n", net.JoinHostPort(printHost, strconv.Itoa(port)))

	if !*noOpen {
		fmt.Printf("Opening %s\n", url)
		go openBrowser(url)
	}

	if err := startServer(addr); err != nil {
		return fmt.Errorf("server error: %w", err)
	}
	return nil
}

func runSampleTemplateCommand(args []string) error {
	fs := flag.NewFlagSet("sample-template", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return nil
		}
		return err
	}
	if fs.NArg() > 0 {
		return fmt.Errorf("unexpected argument: %s", fs.Arg(0))
	}

	content, err := sampleTemplateMarkdown()
	if err != nil {
		return fmt.Errorf("failed to render sample markdown: %w", err)
	}

	fmt.Print(content)
	return nil
}

func freePort(host string) (int, error) {
	const startPort = 4000
	const maxAttempts = 100
	for port := startPort; port < startPort+maxAttempts; port++ {
		addr := net.JoinHostPort(host, strconv.Itoa(port))
		l, err := net.Listen("tcp", addr)
		if err != nil {
			continue
		}
		l.Close()
		return port, nil
	}
	return 0, fmt.Errorf("no free port found in range %d–%d", startPort, startPort+maxAttempts-1)
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	}
	if cmd != nil {
		_ = cmd.Run()
	}
}
