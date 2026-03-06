# Build-only Dockerfile for creating release artifacts
# tomod runs on the host as a systemd service, NOT in Docker
#
# Usage: docker build -t tomod-builder . && docker cp $(docker create tomod-builder):/build/release ./release

FROM oven/bun:1 AS builder

WORKDIR /build

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY source ./source
RUN bun run build

# Production deps only
RUN bun install --production --frozen-lockfile

# Create release tarball
RUN mkdir -p /build/release/tomod && \
    cp -r /build/dist /build/release/tomod/ && \
    cp /build/package.json /build/release/tomod/ && \
    cp -r /build/node_modules /build/release/tomod/ && \
    cd /build/release && tar -czf tomod.tar.gz tomod/
