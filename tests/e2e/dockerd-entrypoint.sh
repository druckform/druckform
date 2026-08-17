#!/usr/bin/env bash
# Starts the nested Docker daemon, waits for it to accept connections, then execs
# the requested command. Requires --privileged.
set -euo pipefail

start_dockerd() {
  local driver="$1" log="$2"
  dockerd --host=unix:///var/run/docker.sock --storage-driver="$driver" >"$log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 45); do
    if docker info >/dev/null 2>&1; then
      echo "harness: nested dockerd ready ($driver driver)"
      return 0
    fi
    kill -0 "$pid" 2>/dev/null || return 1
    sleep 1
  done
  kill "$pid" 2>/dev/null || true
  return 1
}

PRIMARY="${DOCKER_DRIVER:-overlay2}"
if start_dockerd "$PRIMARY" /tmp/dockerd.log; then
  exec "$@"
fi

echo "harness: dockerd failed with the $PRIMARY driver, retrying with vfs" >&2
sed -n '$p;1,20p' /tmp/dockerd.log >&2
# vfs works on any filesystem but copies the full rootfs per layer, so it needs
# far more disk. Only used when overlay2 is unavailable.
if start_dockerd vfs /tmp/dockerd-vfs.log; then
  exec "$@"
fi

echo "harness: nested dockerd would not start with either driver" >&2
echo "--- overlay2 log ---" >&2
cat /tmp/dockerd.log >&2
echo "--- vfs log ---" >&2
cat /tmp/dockerd-vfs.log >&2
exit 1
