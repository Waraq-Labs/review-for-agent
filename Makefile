.PHONY: setup dev-api dev-web build-frontend build verify-frontend-build

setup:
	cd frontend && pnpm install

dev-api:
	go run . --no-open

dev-web:
	cd frontend && pnpm dev

build-frontend:
	cd frontend && pnpm build

build: build-frontend
	go build -o review-for-agent .

verify-frontend-build:
	cd frontend && pnpm build
	@status="$$(git status --porcelain -- frontend/build)"; \
	if [ -n "$$status" ]; then \
		echo "frontend/build is stale. Run 'make build-frontend' and commit updated artifacts."; \
		echo "$$status"; \
		exit 1; \
	fi
