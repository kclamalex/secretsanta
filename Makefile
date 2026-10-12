# Container engine: a running Docker daemon wins (Docker Desktop, Colima, OrbStack
# all expose one), then Podman, then nerdctl, then any installed docker CLI.
# Override with: make up ENGINE=podman
ENGINE ?= $(shell \
	if docker info >/dev/null 2>&1; then echo docker; \
	elif command -v podman >/dev/null 2>&1; then echo podman; \
	elif command -v nerdctl >/dev/null 2>&1; then echo nerdctl; \
	elif command -v docker >/dev/null 2>&1; then echo docker; \
	fi)

IMAGE  ?= secretsanta
NAME   ?= secretsanta
PORT   ?= 3000
VOLUME ?= secretsanta-data
BIND   ?= 0.0.0.0
RUN_ARGS ?=

.PHONY: help engine build up down restart logs status test dev test-mode test-mode-down

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-15s %s\n", $$1, $$2}'
	@echo "  (engine: $(or $(ENGINE),none found))"

engine: ## Make sure the container engine is running
	@if [ -z "$(ENGINE)" ]; then \
		echo "No container engine found. Install Docker, Colima, Podman or nerdctl."; exit 1; \
	fi
	@if ! $(ENGINE) info >/dev/null 2>&1; then \
		if [ "$(ENGINE)" = docker ] && command -v colima >/dev/null 2>&1; then \
			echo "Starting Colima..."; colima start; \
		elif [ "$(ENGINE)" = podman ] && [ "$$(uname)" != Linux ]; then \
			echo "Starting Podman machine..."; podman machine start || true; \
		else \
			echo "$(ENGINE) is installed but not running. Start it and retry."; exit 1; \
		fi; \
	fi
	@echo "Using $(ENGINE)"

build: engine ## Build the image
	$(ENGINE) build -t $(IMAGE) .

up: build ## Build and run the app on http://localhost:3000 (PORT=...)
	-@$(ENGINE) rm -f $(NAME) >/dev/null 2>&1
	$(ENGINE) run -d --name $(NAME) --restart unless-stopped -p $(BIND):$(PORT):3000 -v $(VOLUME):/data $(RUN_ARGS) $(IMAGE)
	@echo "Secret Santa running at http://localhost:$(PORT)"
	@LAN_IP=$$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $$1}'); \
		[ -n "$$LAN_IP" ] && [ "$(BIND)" != 127.0.0.1 ] && echo "On your local network: http://$$LAN_IP:$(PORT)" || true

down: engine ## Stop and remove the container (data volume is kept)
	-$(ENGINE) rm -f $(NAME)

restart: down up ## Rebuild and restart

logs: engine ## Follow app logs
	$(ENGINE) logs -f $(NAME)

status: engine ## Show container status
	$(ENGINE) ps --filter name=$(NAME)

test-mode: ## Separate test container on localhost:3001 only, fake-data tools at /test
	@$(MAKE) --no-print-directory up NAME=secretsanta-test VOLUME=secretsanta-test-data PORT=3001 BIND=127.0.0.1 RUN_ARGS="-e TEST_MODE=1"
	@echo "Test tools (this Mac only): http://localhost:3001/test"

test-mode-down: ## Stop the test container (its data volume is kept)
	@$(MAKE) --no-print-directory down NAME=secretsanta-test

test: ## Run tests locally (needs Node 24+)
	npm test

dev: ## Run API + Vite dev server locally with hot reload
	npx concurrently -n api,web "npm run dev:server" "npm run dev:web"
