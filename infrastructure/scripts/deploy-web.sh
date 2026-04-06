#!/usr/bin/env bash
# deploy-web.sh — Zero-downtime web app deployment with rollback support
#
# Strategy:
#   docker compose up -d --no-deps web
#   → Docker stops the old container and starts the new one.
#   → Nginx upstream (keepalive) buffers in-flight requests during the ~1s gap.
#   → HEALTHCHECK in Dockerfile gates traffic until the new container is ready.
#   → If the health check fails, we immediately roll back to the previous image.
#
# Usage:
#   ./deploy-web.sh deploy  <image> <tag>    # Normal deploy
#   ./deploy-web.sh rollback <image> <tag>   # Roll back to a specific tag
#
# Required on VPS:
#   - Docker + Docker Compose v2
#   - ~/risk-engine/.env with POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
#   - docker login ghcr.io (run once; stored in ~/.docker/config.json)

set -euo pipefail

MODE="${1:-deploy}"
IMAGE="${2:?Image name required (e.g. ghcr.io/owner/risk-engine-web)}"
TAG="${3:?Image tag required (e.g. sha-abc1234 or latest)}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$INFRA_DIR/../.env"
COMPOSE_FILES="-f $INFRA_DIR/docker-compose.yml -f $INFRA_DIR/docker-compose.prod.yml"
# Pin the project name so it is always the same regardless of the CWD the
# caller uses. Without this, running from ~/risk-engine vs
# ~/risk-engine/infrastructure produces different project names and Docker
# Compose loses track of the postgres/redis containers it did not start.
COMPOSE_PROJECT="risk-engine"
CONTAINER="risk-web"
PREV_IMAGE_FILE="/tmp/risk-web-prev-image"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

# ─── Pull image from registry ─────────────────────────────────────────────────
pull_image() {
  log "Pulling $IMAGE:$TAG ..."
  docker pull "$IMAGE:$TAG"
}

# ─── Save current image tag so we can roll back to it ─────────────────────────
save_prev_image() {
  local prev
  prev=$(docker inspect --format='{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)
  if [[ -n "$prev" ]]; then
    echo "$prev" > "$PREV_IMAGE_FILE"
    log "Saved previous image: $prev"
  fi
}

# ─── Wait for container HEALTHCHECK to report healthy ─────────────────────────
wait_healthy() {
  local max_attempts=24   # 24 × 5s = 2 min
  local attempt=0
  log "Waiting for $CONTAINER to become healthy ..."
  while [[ $attempt -lt $max_attempts ]]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")
    case "$status" in
      healthy) log "$CONTAINER is healthy."; return 0 ;;
      unhealthy) fail "$CONTAINER reported unhealthy. Check: docker logs $CONTAINER" ;;
    esac
    attempt=$((attempt + 1))
    sleep 5
  done
  fail "$CONTAINER did not become healthy within 2 minutes."
}

# ─── Start the service with a given image tag ──────────────────────────────────
start_service() {
  local img="$1" tg="$2"
  log "Starting web service with $img:$tg ..."
  docker rm -f "$CONTAINER" 2>/dev/null || true
  WEB_IMAGE="$img" WEB_IMAGE_TAG="$tg" \
    docker compose --project-name "$COMPOSE_PROJECT" --env-file "$ENV_FILE" $COMPOSE_FILES \
    up -d --no-deps --force-recreate web
}

# ─── Remove old sha- tagged images (keep latest 3) ────────────────────────────
prune_old_images() {
  log "Pruning old images (keeping 3 most recent sha- tags) ..."
  docker images "$IMAGE" --format '{{.Tag}}' \
    | { grep '^sha-' || true; } \
    | sort -r \
    | tail -n +4 \
    | while read -r old_tag; do
        docker rmi "$IMAGE:$old_tag" 2>/dev/null \
          && log "Removed $IMAGE:$old_tag" \
          || true
      done
}

# ─── Deploy ───────────────────────────────────────────────────────────────────
do_deploy() {
  log "═══════════════════════════════════════════════"
  log "  DEPLOY  $IMAGE:$TAG"
  log "═══════════════════════════════════════════════"

  pull_image
  save_prev_image
  start_service "$IMAGE" "$TAG"

  if ! wait_healthy; then
    log "Health check failed — initiating automatic rollback ..."
    if [[ -f "$PREV_IMAGE_FILE" ]]; then
      local prev_image prev_tag
      prev_image=$(cat "$PREV_IMAGE_FILE")
      # prev_image is "image:tag" — split on last ':'
      prev_tag="${prev_image##*:}"
      prev_image="${prev_image%:*}"
      log "Rolling back to $prev_image:$prev_tag ..."
      start_service "$prev_image" "$prev_tag"
      wait_healthy
      log "Rollback complete."
    else
      fail "No previous image saved — cannot auto-rollback."
    fi
    exit 1
  fi

  prune_old_images
  log "═══════════════════════════════════════════════"
  log "  DEPLOY COMPLETE  $IMAGE:$TAG"
  log "═══════════════════════════════════════════════"
}

# ─── Manual rollback ──────────────────────────────────────────────────────────
do_rollback() {
  log "═══════════════════════════════════════════════"
  log "  ROLLBACK  $IMAGE:$TAG"
  log "═══════════════════════════════════════════════"

  pull_image
  start_service "$IMAGE" "$TAG"
  wait_healthy

  log "═══════════════════════════════════════════════"
  log "  ROLLBACK COMPLETE  $IMAGE:$TAG"
  log "═══════════════════════════════════════════════"
}

# ─── Entrypoint ───────────────────────────────────────────────────────────────
case "$MODE" in
  deploy)   do_deploy ;;
  rollback) do_rollback ;;
  *)        fail "Unknown mode '$MODE'. Use: deploy | rollback" ;;
esac
