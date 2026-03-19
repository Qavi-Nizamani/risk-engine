# syntax=docker/dockerfile:1.4
#
# Build context: MONOREPO ROOT (run from repo root, not apps/web/)
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     --build-arg NEXT_PUBLIC_WS_URL=https://ws.example.com \
#     -t risk-engine-web:latest .

# ─── Stage 1: pruner ─────────────────────────────────────────────────────────
# Extracts only the packages needed to build the web app (turbo prune).
# This keeps subsequent stages lean — only web + @risk-engine/types are included.
FROM node:22-alpine AS pruner
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Install turbo to run prune (not part of runtime — only this stage needs it)
RUN --mount=type=cache,id=pnpm-global,target=/pnpm/store \
    pnpm add -g turbo@^2

COPY . .
# --docker splits output into out/json/ (manifests) and out/full/ (source)
RUN turbo prune web --docker


# ─── Stage 2: builder ────────────────────────────────────────────────────────
# Installs dependencies and runs `next build`.
# BuildKit cache mount keeps pnpm's content-addressable store across builds,
# so repeated CI runs don't re-download unchanged packages.
FROM node:22-alpine AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Layer A — install deps (cached unless lockfile / package.json files change)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# Layer B — full pruned source (merges on top; node_modules directories untouched)
COPY --from=pruner /app/out/full/ .

# turbo prune does not reliably copy root-level config files into out/full/.
# Copy tsconfig.base.json directly from the pruner's full repo so that
# apps/web/tsconfig.json can resolve: extends "../../tsconfig.base.json"
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json

# NEXT_PUBLIC_* vars are baked into the client bundle at build time.
# Pass them via --build-arg in CI; they are NOT overridable at runtime.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_WS_URL=http://localhost:4001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter web build


# ─── Stage 3: runner ─────────────────────────────────────────────────────────
# Minimal production image using Next.js standalone output.
# The standalone folder is self-contained: it includes a Node.js server and
# all traced runtime dependencies — no pnpm / node_modules copying needed.
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone server (includes server.js + traced node_modules)
# Path mirrors the monorepo structure: apps/web/server.js inside standalone/
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Static assets (JS chunks, CSS) — must be copied separately from standalone
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

# Uncomment when public/ assets are added to apps/web/public/
# COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
