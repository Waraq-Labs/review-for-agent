package main

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed web
var webFS embed.FS

func startServer(addr string) error {
	mux := http.NewServeMux()

	// Serve static assets (CSS, JS) from embedded web/ directory
	staticFiles, _ := fs.Sub(webFS, "web")
	mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(staticFiles))))

	mux.HandleFunc("GET /review", handleReview)
	mux.HandleFunc("GET /api/diff", handleDiff)
	mux.HandleFunc("POST /api/comments", handleComments)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/review", http.StatusFound)
			return
		}
		http.NotFound(w, r)
	})

	return http.ListenAndServe(addr, mux)
}

func handleReview(w http.ResponseWriter, r *http.Request) {
	data, err := fs.ReadFile(webFS, "web/review.html")
	if err != nil {
		http.Error(w, "Failed to load review page", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write(data)
}

func handleDiff(w http.ResponseWriter, r *http.Request) {
	diff, err := getGitDiff()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Write([]byte(diff))
}
