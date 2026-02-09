package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

func main() {
	if len(os.Args) < 2 || os.Args[1] != "start" {
		fmt.Fprintf(os.Stderr, "Usage: reviews-for-agent start\n")
		os.Exit(1)
	}

	addr := ":4000"
	url := "http://localhost:4000/review"

	fmt.Printf("Listening on localhost%s\n", addr)
	fmt.Printf("Opening %s\n", url)

	go openBrowser(url)

	if err := startServer(addr); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
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
