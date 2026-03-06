FROM oven/bun:1 AS builder

WORKDIR /build

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY tsconfig.json index.ts ./
RUN bun run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /build/dist ./dist
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "dist/index.js"]
