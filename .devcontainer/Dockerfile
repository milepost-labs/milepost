# NOTE: Toolchain versions (Rust stable, wasm32v1-none target, stellar CLI 27.1.0, Node.js 24)
# are kept strictly in sync with .github/workflows/ci.yml and rust-toolchain.toml.
# When updating toolchain versions here, remember to update .github/workflows/ci.yml as well.

FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install core build dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 24 (matches CI node-version: 24)
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Switch to vscode user for Rust and Stellar CLI setup
USER vscode
ENV HOME=/home/vscode

# Install Rust stable with wasm32v1-none target, rustfmt, clippy (matches rust-toolchain.toml and CI)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    --default-toolchain stable \
    --target wasm32v1-none \
    --component rustfmt clippy

ENV PATH="/home/vscode/.cargo/bin:${PATH}"

# Install Stellar CLI 27.1.0 (matches stellar/stellar-cli@v27.1.0 in CI)
RUN cargo install --locked stellar-cli --version 27.1.0

WORKDIR /workspace
