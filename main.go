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

func freePort() (int, error) {
	// Port 0 tells the OS to assign a random available port.
	l, err := net.Listen("tcp", ":0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
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
