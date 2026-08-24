#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_HOST="${REMOTE_HOST:-root@192.168.0.161}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/opt/1panel/apps/local/map-service/map-service}"
REMOTE_TEMPLATE_DIR="${REMOTE_TEMPLATE_DIR:-/opt/1panel/resource/apps/local/map-service}"
REMOTE_BACKUP_ROOT="${REMOTE_BACKUP_ROOT:-/opt/1panel/backup/map-service}"
CONTAINER_NAME="${CONTAINER_NAME:-map-service-161}"
PORT="${PORT:-33088}"
RUN_CHECKS="${RUN_CHECKS:-1}"
RELEASE_VERSION="${RELEASE_VERSION:-$(node -p "require('$ROOT_DIR/package.json').version")}"
IMAGE_NAME="map-service:${RELEASE_VERSION}"
DEPLOY_ARCHIVE=""

log() { printf '[deploy-161] %s\n' "$*"; }
fail() { printf '[deploy-161] ERROR: %s\n' "$*" >&2; exit 1; }

cleanup_deploy_archive() {
  if [[ -n "${DEPLOY_ARCHIVE:-}" ]]; then
    rm -f -- "$DEPLOY_ARCHIVE"
  fi
}

usage() {
  cat <<'EOF'
用法：
  ./deploy-161.sh
  ./deploy-161.sh --rollback /opt/1panel/backup/map-service/YYYY/MM/DD/<backup-name>

可选环境变量：RUN_CHECKS=0、REMOTE_HOST、PORT、RELEASE_VERSION。
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

run_local_checks() {
  if [[ "$RUN_CHECKS" != "1" ]]; then
    log '已跳过本地检查（RUN_CHECKS=0）'
    return
  fi
  log '运行 npm run check'
  (cd "$ROOT_DIR" && npm run check)
  log '运行 npm test'
  (cd "$ROOT_DIR" && npm test)
  log '运行 npm run build'
  (cd "$ROOT_DIR" && npm run build)
  git -C "$ROOT_DIR" diff --check
}

assert_release_tree() {
  [[ -z "$(git -C "$ROOT_DIR" status --porcelain)" ]] || {
    git -C "$ROOT_DIR" status --short
    fail '发布要求工作树干净；请先提交变更'
  }
  local package_version
  package_version="$(node -p "require('$ROOT_DIR/package.json').version")"
  [[ "$package_version" == "$RELEASE_VERSION" ]] || fail "RELEASE_VERSION=$RELEASE_VERSION 与 package.json=$package_version 不一致"
}

remote_rollback() {
  local backup_dir="$1"
  [[ "$backup_dir" == "$REMOTE_BACKUP_ROOT"/* ]] || fail '回滚目录不在允许的备份根目录内'
  log "回滚 161 到 $backup_dir"
  ssh -o ConnectTimeout=10 "$REMOTE_HOST" \
    "APP_DIR='$REMOTE_APP_DIR' BACKUP_DIR='$backup_dir' CONTAINER_NAME='$CONTAINER_NAME' PORT='$PORT' bash -s" <<'REMOTE'
set -euo pipefail
[[ -d "$BACKUP_DIR/app" ]] || { echo 'backup app directory missing' >&2; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo 'current .env missing' >&2; exit 1; }
runtime_dir="$(mktemp -d /tmp/map-service-rollback.XXXXXX)"
trap 'rm -rf "$runtime_dir"' EXIT
cp -a "$APP_DIR/.env" "$runtime_dir/.env"
[[ ! -f "$APP_DIR/admin-password.txt" ]] || cp -a "$APP_DIR/admin-password.txt" "$runtime_dir/admin-password.txt"
find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'admin-password.txt' ! -name 'data' -exec rm -rf -- {} +
cp -a "$BACKUP_DIR/app/." "$APP_DIR/"
cp -a "$runtime_dir/.env" "$APP_DIR/.env"
[[ ! -f "$runtime_dir/admin-password.txt" ]] || cp -a "$runtime_dir/admin-password.txt" "$APP_DIR/admin-password.txt"
cd "$APP_DIR"
docker compose up -d --build --remove-orphans
curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/health" >/dev/null
curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null
docker inspect "$CONTAINER_NAME" --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}'
REMOTE
  log '回滚完成'
}

deploy_release() {
  local archive checksum archive_name remote_archive_name
  archive_name="map-service-${RELEASE_VERSION}-$(git -C "$ROOT_DIR" rev-parse --short HEAD).tgz"
  DEPLOY_ARCHIVE="$(mktemp "/tmp/${archive_name}.XXXXXX")"
  archive="$DEPLOY_ARCHIVE"
  remote_archive_name="$(basename "$archive")"
  trap cleanup_deploy_archive EXIT

  log "打包版本 ${RELEASE_VERSION}"
  git -C "$ROOT_DIR" archive --format=tar HEAD | gzip -9 >"$archive"
  checksum="$(shasum -a 256 "$archive" | awk '{print $1}')"
  scp -q "$archive" "$REMOTE_HOST:/tmp/$remote_archive_name"

  log "部署镜像 $IMAGE_NAME 到 161"
  ssh -o ConnectTimeout=10 "$REMOTE_HOST" \
    "APP_DIR='$REMOTE_APP_DIR' TEMPLATE_DIR='$REMOTE_TEMPLATE_DIR' BACKUP_ROOT='$REMOTE_BACKUP_ROOT' ARCHIVE='/tmp/$remote_archive_name' ARCHIVE_SHA256='$checksum' RELEASE_VERSION='$RELEASE_VERSION' IMAGE_NAME='$IMAGE_NAME' CONTAINER_NAME='$CONTAINER_NAME' PORT='$PORT' bash -s" <<'REMOTE'
set -euo pipefail

log() { printf '[deploy-161:remote] %s\n' "$*"; }
lock_dir=/run/map-service-161-deploy.lock
if ! mkdir "$lock_dir" 2>/dev/null; then
  echo '已有 map-service 161 发布任务运行中' >&2
  exit 1
fi
runtime_dir="$(mktemp -d /tmp/map-service-release.XXXXXX)"
cleanup() { rm -rf "$runtime_dir" "$lock_dir" "$ARCHIVE"; }
trap cleanup EXIT

actual_sha="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
[[ "$actual_sha" == "$ARCHIVE_SHA256" ]] || { echo '发布包 SHA-256 校验失败' >&2; exit 1; }
[[ -f "$APP_DIR/.env" ]] || { echo '.env 不存在，拒绝覆盖部署' >&2; exit 1; }
[[ -f "$APP_DIR/docker-compose.yml" ]] || { echo 'docker-compose.yml 不存在' >&2; exit 1; }

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$BACKUP_ROOT/$(date +%Y/%m/%d)/${timestamp}-pre-v${RELEASE_VERSION}"
mkdir -p "$backup_dir/app" "$backup_dir/template"
log "备份当前应用到 $backup_dir"
tar -C "$APP_DIR" \
  --exclude='.env' --exclude='admin-password.txt' --exclude='data' \
  -cf - . | tar -C "$backup_dir/app" -xf -
[[ ! -d "$TEMPLATE_DIR" ]] || tar -C "$TEMPLATE_DIR" -cf - . | tar -C "$backup_dir/template" -xf -
docker inspect "$CONTAINER_NAME" >"$backup_dir/container-inspect.json" 2>/dev/null || true
docker image inspect "$(docker inspect "$CONTAINER_NAME" --format '{{.Image}}' 2>/dev/null || true)" >"$backup_dir/image-inspect.json" 2>/dev/null || true
sha256sum "$ARCHIVE" >"$backup_dir/release.sha256"

tar -xzf "$ARCHIVE" -C "$runtime_dir"
cp "$APP_DIR/.env" "$runtime_dir/.env"
[[ ! -f "$APP_DIR/admin-password.txt" ]] || cp "$APP_DIR/admin-password.txt" "$runtime_dir/admin-password.txt"

cat >"$runtime_dir/Dockerfile" <<'DOCKERFILE'
FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 3088
CMD ["node", "service/index.js"]
DOCKERFILE

cat >"$runtime_dir/docker-compose.yml" <<COMPOSE
services:
  map-service:
    build:
      context: .
      dockerfile: Dockerfile
    image: ${IMAGE_NAME}
    container_name: \${CONTAINER_NAME:-map-service-161}
    restart: unless-stopped
    init: true
    mem_limit: 768m
    networks:
      - 1panel-network
    ports:
      - "\${PANEL_APP_PORT_HTTP:-33088}:3088"
    env_file:
      - .env
    environment:
      NODE_ENV: production
      MAP_SERVICE_PORT: 3088
      MAP_SERVICE_USER_DATABASE: /app/.db/map-service.sqlite
      MAP_SERVICE_INTERACTION_DATABASE: /app/.db/interaction.sqlite
      MAP_SERVICE_REQUIRE_SECURE_BOOTSTRAP: "true"
      MAP_SERVICE_AI_ENABLED: "false"
    volumes:
      - ./data/db:/app/.db
      - ./data/log:/app/log
      - ./data/cache:/app/.cache
      - ./data/logs:/app/logs
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    labels:
      createdBy: "Apps"
networks:
  1panel-network:
    external: true
COMPOSE

rollback_needed=1
rollback() {
  log '部署失败，恢复发布前代码与 Compose'
  find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'admin-password.txt' ! -name 'data' -exec rm -rf -- {} +
  cp -a "$backup_dir/app/." "$APP_DIR/"
  cd "$APP_DIR"
  docker compose up -d --build --remove-orphans || true
}
on_error() {
  rc=$?
  if [[ "$rollback_needed" == 1 ]]; then rollback_needed=0; rollback; fi
  exit "$rc"
}
trap on_error ERR

find "$APP_DIR" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'admin-password.txt' ! -name 'data' -exec rm -rf -- {} +
tar -C "$runtime_dir" --exclude='.env' --exclude='admin-password.txt' --exclude='data' -cf - . | tar -C "$APP_DIR" -xf -
cd "$APP_DIR"
docker compose config >/dev/null
docker compose build --pull
docker compose up -d --remove-orphans

for attempt in $(seq 1 40); do
  if curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/health" >/dev/null &&
     curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/api/v1/health" >/dev/null; then
    break
  fi
  [[ "$attempt" != 40 ]] || { docker compose logs --tail=120 map-service >&2; exit 1; }
  sleep 2
done

running_image="$(docker inspect "$CONTAINER_NAME" --format '{{.Config.Image}}')"
[[ "$running_image" == "$IMAGE_NAME" ]] || { echo "运行镜像不一致：$running_image" >&2; exit 1; }
package_version="$(docker exec "$CONTAINER_NAME" node -p "require('/app/package.json').version")"
[[ "$package_version" == "$RELEASE_VERSION" ]] || { echo "容器包版本不一致：$package_version" >&2; exit 1; }
container_count="$(docker ps --filter "name=^/${CONTAINER_NAME}$" --format '{{.Names}}' | wc -l | tr -d ' ')"
[[ "$container_count" == 1 ]] || { echo "容器数量异常：$container_count" >&2; exit 1; }

version_dir="$TEMPLATE_DIR/$RELEASE_VERSION"
mkdir -p "$version_dir"
cp "$APP_DIR/docker-compose.yml" "$version_dir/docker-compose.yml"
previous_template="$(find "$TEMPLATE_DIR" -mindepth 2 -maxdepth 2 -type f -name data.yml -printf '%h\n' 2>/dev/null | sort -V | tail -n 1)"
if [[ -n "$previous_template" && -f "$previous_template/data.yml" ]]; then
  cp "$previous_template/data.yml" "$version_dir/data.yml"
fi
if [[ -f "$TEMPLATE_DIR/data.yml" ]]; then
  sed -i "s/map-service v[0-9][0-9.]*/map-service v${RELEASE_VERSION}/" "$TEMPLATE_DIR/data.yml"
fi

rollback_needed=0
trap - ERR
log "部署完成：version=$package_version image=$running_image backup=$backup_dir"
REMOTE
}

main() {
  require_command git
  require_command node
  require_command npm
  require_command ssh
  require_command scp
  require_command shasum

  case "${1:-}" in
    '')
      run_local_checks
      assert_release_tree
      deploy_release
      ;;
    --rollback)
      [[ $# == 2 ]] || { usage; exit 2; }
      remote_rollback "$2"
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

main "$@"
