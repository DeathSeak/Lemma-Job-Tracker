#!/usr/bin/env bash
# Lemma CLI installer bootstrap for macOS/Linux.
#
#   ./install_lemma.sh
#
# Installs uv (if missing), and installs the lemma-terminal CLI tool.
#
# Requires: curl.
set -Eeuo pipefail

say() { printf '%s\n' "$*"; }
fail() {
  say "error: $*" >&2
  exit 1
}

export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

# Install uv if missing
if ! command -v uv >/dev/null 2>&1; then
  say "Installing uv (https://astral.sh/uv)…"
  command -v curl >/dev/null 2>&1 || fail "curl is required; install curl and re-run"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # Re-source PATH
  export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
  if ! command -v uv >/dev/null 2>&1; then
    fail "uv was installed but is not on PATH. Please add $HOME/.local/bin to your PATH and re-run."
  fi
fi

say "Installing lemma-terminal (CLI)…"
uv tool install --force lemma-terminal >/dev/null

if ! command -v lemma >/dev/null 2>&1; then
  export PATH="$(uv tool dir --bin):$PATH"
fi

if ! command -v lemma >/dev/null 2>&1; then
  fail "lemma-terminal was installed but is not on PATH."
fi

say "Lemma CLI installation successful! You can now run the 'lemma' command."
