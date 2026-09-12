#!/bin/sh
set -eu

PORT="${PORT:-10000}"
PUBLIC_URL="${PUBLIC_URL:-${RENDER_EXTERNAL_URL:-}}"

strip_outer_quotes() {
    value="$1"
    case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    printf '%s' "$value"
}

if [ -n "${REDIS_URL:-}" ]; then
    REDIS_URL="$(strip_outer_quotes "$REDIS_URL")"
    export REDIS_URL
fi
if [ -n "${LIVEKIT_URL:-}" ]; then
    LIVEKIT_URL="$(strip_outer_quotes "$LIVEKIT_URL")"
    export LIVEKIT_URL
fi
if [ -n "${LIVEKIT_HOST:-}" ]; then
    LIVEKIT_HOST="$(strip_outer_quotes "$LIVEKIT_HOST")"
    export LIVEKIT_HOST
fi
if [ -n "${LIVEKIT_API_KEY:-}" ]; then
    LIVEKIT_API_KEY="$(strip_outer_quotes "$LIVEKIT_API_KEY")"
    export LIVEKIT_API_KEY
fi
if [ -n "${LIVEKIT_API_SECRET:-}" ]; then
    LIVEKIT_API_SECRET="$(strip_outer_quotes "$LIVEKIT_API_SECRET")"
    export LIVEKIT_API_SECRET
fi
if [ -z "$PUBLIC_URL" ] && [ -n "${RENDER_EXTERNAL_HOSTNAME:-}" ]; then
    PUBLIC_URL="https://${RENDER_EXTERNAL_HOSTNAME}"
fi
PUBLIC_URL="${PUBLIC_URL:-http://localhost:${PORT}}"
PUBLIC_URL="${PUBLIC_URL%/}"

if [ -z "${SECRET_KEY:-}" ]; then
    SECRET_KEY="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
    echo "SECRET_KEY ausente; usando uma chave efêmera para esta execução."
fi

PUBLIC_HOST="$(PUBLIC_URL="$PUBLIC_URL" node -e "process.stdout.write(new URL(process.env.PUBLIC_URL).host)")"

export PORT PUBLIC_URL SECRET_KEY
export PLAY_URL="${PLAY_URL:-$PUBLIC_URL}"
export PUSHER_URL="${PUSHER_URL:-$PUBLIC_URL}"
export FRONT_URL="${FRONT_URL:-/}"
export API_URL="${API_URL:-127.0.0.1:50051}"
export INTERNAL_MAP_STORAGE_URL="${INTERNAL_MAP_STORAGE_URL:-http://127.0.0.1:3002}"
export PUBLIC_MAP_STORAGE_URL="${PUBLIC_MAP_STORAGE_URL:-$PUBLIC_URL/map-storage}"
export MAP_STORAGE_URL="${MAP_STORAGE_URL:-127.0.0.1:50053}"
export MAP_STORAGE_API_TOKEN="${MAP_STORAGE_API_TOKEN:-$SECRET_KEY}"
export STORAGE_DIRECTORY="${STORAGE_DIRECTORY:-/data/maps}"
export PATH_PREFIX="${PATH_PREFIX:-/map-storage}"
export UPLOADER_URL="${UPLOADER_URL:-$PUBLIC_URL/uploader}"
export ICON_URL="${ICON_URL:-/icon}"
export START_ROOM_URL="${START_ROOM_URL:-/_/global/$PUBLIC_HOST/maps/scale-office/office.tmj}"
export FALLBACK_LOCALE="${FALLBACK_LOCALE:-pt-BR}"
export ENABLE_CHAT="${ENABLE_CHAT:-false}"
export ENABLE_CHAT_UPLOAD="${ENABLE_CHAT_UPLOAD:-false}"
export ENABLE_TUTORIAL="${ENABLE_TUTORIAL:-true}"
export ENABLE_TELEMETRY="${ENABLE_TELEMETRY:-false}"
export MAX_USERS_FOR_WEBRTC="${MAX_USERS_FOR_WEBRTC:-1}"
export STUN_SERVER="${STUN_SERVER:-stun:stun.l.google.com:19302}"
export ENTITY_COLLECTION_URLS="${ENTITY_COLLECTION_URLS:-$PUBLIC_URL/collections/FurnitureCollection.json,$PUBLIC_URL/collections/OfficeCollection.json}"

if [ -z "${LIVEKIT_HOST:-}" ] && [ -n "${LIVEKIT_URL:-}" ]; then
    export LIVEKIT_HOST="$LIVEKIT_URL"
fi

sed "s/__PORT__/$PORT/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf
mkdir -p "$STORAGE_DIRECTORY"
chown -R node:node "$STORAGE_DIRECTORY"

pids=""
start_service() {
    service_name="$1"
    shift
    echo "Iniciando $service_name..."
    "$@" &
    pids="$pids $!"
}

stop_services() {
    trap - TERM INT
    if [ -n "$pids" ]; then
        kill $pids 2>/dev/null || true
        wait $pids 2>/dev/null || true
    fi
}

trap stop_services TERM INT EXIT

start_service "back" gosu node sh -c "cd /usr/src/back && exec /usr/src/node_modules/.bin/tsx src/server.ts"
start_service "map-storage" gosu node env HTTP_PORT=3002 GRPC_PORT=50053 sh -c "cd /usr/src/map-storage && exec /usr/src/node_modules/.bin/tsx src/index.ts"
start_service "uploader" gosu node env HTTP_PORT=8081 sh -c "cd /usr/src/uploader && exec /usr/src/node_modules/.bin/tsx server.ts"
start_service "play" gosu node sh -c "cd /usr/src/play && exec /usr/src/node_modules/.bin/tsx src/server.ts"
start_service "iconserver" env PORT=8082 SERVER_MODE=redirect /usr/local/bin/iconserver
start_service "nginx" nginx -g "daemon off;"

while true; do
    for pid in $pids; do
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "Um processo essencial encerrou inesperadamente (PID $pid)."
            exit 1
        fi
    done
    sleep 2
done
