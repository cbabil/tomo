# Tomo v2
# Run, build, and test commands

SHELL := /bin/bash

.PHONY: help setup dev dev-tomod dev-ui build build-tomod build-ui \
        test test-tomod test-ui lint format typecheck \
        docker-network docker-build-proxy deb deb-arm64 clean

# Default target
help: ## Show this help
	@echo "Tomo v2"
	@echo "================="
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

# Setup
setup: ## Install dependencies, create .env and data dir
	@echo "Installing dependencies..."
	@bun install
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example"; \
	fi
	@mkdir -p data/secrets data/app-stores data/app-data data/backups
	@echo "Setup complete!"

# Development
dev: ## Run tomod + ui in parallel
	@set -a && [ -f .env ] && . ./.env; set +a && TOMO_PROJECT_ROOT=$(CURDIR) bun run dev

dev-tomod: ## Run tomod in dev mode
	@set -a && [ -f .env ] && . ./.env; set +a && TOMO_PROJECT_ROOT=$(CURDIR) bun run dev:tomod

dev-ui: ## Run ui in dev mode
	@bun run dev:ui

# Build
build: ## Build all packages
	@bun run build

build-tomod: ## Build tomod
	@bun run build:tomod

build-ui: ## Build ui
	@bun run build:ui

# Testing
test: ## Run all tests
	@bun run test

test-tomod: ## Run tomod tests
	@bun run test:tomod

test-ui: ## Run ui tests
	@bun run test:ui

# Code Quality
lint: ## Lint all packages
	@bun run lint

format: ## Format all code
	@bun run format

typecheck: ## Type check all packages
	@bun run typecheck

# Docker (for apps only — tomod runs on the host)
docker-network: ## Create the tomo_main Docker network for apps
	@docker network inspect tomo_main >/dev/null 2>&1 || docker network create tomo_main
	@echo "Docker network 'tomo_main' ready"

docker-build-proxy: ## Build the app-proxy Docker image
	@echo "Building app-proxy image..."
	@docker build -t ghcr.io/cbabil/app-proxy:latest -f containers/app-proxy/Dockerfile containers/app-proxy/
	@echo "Done!"

# Packaging
deb: build ## Build .deb package (amd64)
	@bash packaging/build-deb.sh --arch amd64

deb-arm64: build ## Build .deb package (arm64)
	@bash packaging/build-deb.sh --arch arm64

# Cleanup
clean: ## Remove node_modules, dist, and build artifacts
	@echo "Cleaning..."
	@rm -rf node_modules
	@rm -rf packages/tomod/node_modules packages/tomod/dist
	@rm -rf packages/ui/node_modules packages/ui/dist
	@rm -rf containers/app-proxy/node_modules containers/app-proxy/dist
	@rm -rf packaging/build
	@echo "Done!"
