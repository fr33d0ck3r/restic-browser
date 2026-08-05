SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help deps deps-system deps-node deps-rust dev build appimage clean install uninstall icon

NAME := restic-browser
VERSION := $(shell grep '"version"' package.json | head -1 | sed 's/.*": "\(.*\)".*/\1/')
ARCH := $(shell dpkg --print-architecture 2>/dev/null || echo amd64)
CARGO_TARGET_DIR ?= /tmp/restic-browser-target
BUILD_DIR := $(CARGO_TARGET_DIR)/release
BINARY_NAME := Restic-Browser
DESTDIR :=
PREFIX := /usr

NVM_DIR ?= $(HOME)/.nvm
NVM_VERSION := 0.40.1
CARGO_HOME ?= $(HOME)/.cargo

export RUSTFLAGS := -C linker=clang -C link-arg=-fuse-ld=mold
export TAURI_DEBUG := 1
export CARGO_TARGET_DIR

APT_PACKAGES := \
  build-essential \
  pkg-config \
  cmake \
  clang \
  mold \
  imagemagick \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  librsvg2-dev \
  libayatana-appindicator3-dev \
  patchelf \
  curl \
  ca-certificates

help:
	@echo "Restic-Browser build system"
	@echo ""
	@echo "Targets:"
	@echo "  make deps        Install ALL dependencies (system + node + rust)"
	@echo "  make dev         Start tauri dev server"
	@echo "  make build       Build production binary"
	@echo "  make appimage    Build AppImage into bin/"
	@echo "  make install     Install binary to $(DESTDIR)$(PREFIX)/bin"
	@echo "  make uninstall   Remove binary"
	@echo "  make clean       Remove build artifacts"
	@echo "  make help        Show this message"
	@echo ""
	@echo "Variables:"
	@echo "  CARGO_TARGET_DIR=$(CARGO_TARGET_DIR)  (override with: make CARGO_TARGET_DIR=/path)"

deps: deps-system deps-node deps-rust
	@echo "=== All dependencies installed ==="

deps-system:
	@echo "=== Installing system packages ==="
	@if command -v apt-get >/dev/null 2>&1; then \
	  sudo apt-get update -qq && \
	  sudo apt-get install -y --no-install-recommends $(APT_PACKAGES); \
	elif command -v dnf >/dev/null 2>&1; then \
	  sudo dnf install -y \
	    webkit2gtk4.1-devel gtk3-devel librsvg2-devel \
	    libayatana-appindicator-devel clang mold cmake \
	    patchelf pkgconf-pkg-config imagemagick; \
	elif command -v pacman >/dev/null 2>&1; then \
	  sudo pacman -S --noconfirm --needed \
	    webkit2gtk-4.1 gtk3 librsvg libayatana-appindicator \
	    clang mold cmake patchelf pkgconf imagemagick; \
	else \
	  echo "Unsupported distro. Install Tauri prerequisites manually:"; \
	  echo "  https://v2.tauri.app/start/prerequisites/"; \
	  exit 1; \
	fi

deps-node:
	@echo "=== Installing NVM + Node.js ==="
	@if [ ! -d "$(NVM_DIR)" ]; then \
	  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v$(NVM_VERSION)/install.sh | bash; \
	fi
	@. "$(NVM_DIR)/nvm.sh" && nvm install node && nvm alias default node
	@. "$(NVM_DIR)/nvm.sh" && node --version && npm --version
	@echo "=== Installing npm dependencies ==="
	npm ci

deps-rust:
	@echo "=== Installing Rust via rustup ==="
	@if [ ! -d "$(CARGO_HOME)" ]; then \
	  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path; \
	fi
	@. "$(CARGO_HOME)/env" && rustup default stable && rustc --version && cargo --version

icon:
	@echo "=== Verifying icon ==="
	@if [ ! -f src-tauri/icons/icon.ico ] && [ -f src-tauri/icons/icon.png ]; then \
	  convert src-tauri/icons/icon.png \
	    -define icon:auto-resize=256,128,64,48,32,16 \
	    src-tauri/icons/icon.ico; \
	fi

dev:
	@echo "=== Starting dev server (port 1420) ==="
	npm run tauri dev

build: icon
	@echo "=== Building TypeScript ==="
	npm run build
	@echo "=== Building Tauri bundle ==="
	@. "$(CARGO_HOME)/env" 2>/dev/null || true
	npm run tauri build -- --verbose
	@mkdir -p bin
	@cp $(BUILD_DIR)/$(BINARY_NAME) bin/ 2>/dev/null || true
	@echo "=== Binary ready in bin/ ==="

appimage: build
	@echo "=== Copying AppImage to bin/ ==="
	@mkdir -p bin
	@cp $(BUILD_DIR)/bundle/appimage/*.AppImage bin/ 2>/dev/null \
	  && chmod +x bin/*.AppImage \
	  && ls -lh bin/*.AppImage \
	  || echo "No AppImage produced. Check tauri.conf.json bundle.targets."

install: build
	@echo "=== Installing $(NAME) to $(DESTDIR)$(PREFIX)/bin ==="
	install -D -m 755 $(BUILD_DIR)/$(BINARY_NAME) $(DESTDIR)$(PREFIX)/bin/$(BINARY_NAME)

uninstall:
	@echo "=== Removing $(BINARY_NAME) ==="
	rm -f $(DESTDIR)$(PREFIX)/bin/$(BINARY_NAME)

clean:
	@echo "=== Cleaning build artifacts ==="
	rm -rf dist/ bin/ node_modules/.vite/
	rm -rf "$(CARGO_TARGET_DIR)"
	find . -name "*.db" -type f -delete 2>/dev/null || true
