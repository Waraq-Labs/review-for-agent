package main

import (
	"flag"
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
)

func main() {
	noOpen := flag.Bool("no-open", false, "suppress auto-opening the browser")
	flag.Parse()

	ignoreCount, err := configureRFAIgnore(".rfaignore")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load .rfaignore: %v\n", err)
		os.Exit(1)
	}
	if ignoreCount > 0 {
		fmt.Printf("Loaded %d .rfaignore pattern(s)\n", ignoreCount)
	}

	port, err := freePort()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to find free port: %v\n", err)
		os.Exit(1)
	}

	addr := fmt.Sprintf(":%d", port)
	url := fmt.Sprintf("http://localhost:%d/review", port)

	fmt.Printf("Listening on localhost%s\n", addr)

	if !*noOpen {
		fmt.Printf("Opening %s\n", url)
		go openBrowser(url)
	}

	if err := startServer(addr); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}

// freePort tries port 4000 first, then increments until a free port is found.
// This provides a stable default while allowing multiple instances to coexist.
func freePort() (int, error) {
	const startPort = 4000
	const maxAttempts = 100
	for port := startPort; port < startPort+maxAttempts; port++ {
		l, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
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
