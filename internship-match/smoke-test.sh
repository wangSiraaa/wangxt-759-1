#!/bin/bash
set -e

echo "=== 校企实习岗位撮合平台 - Smoke Test ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "[1/4] Building Docker image..."
docker compose build --quiet

echo "[2/4] Starting container..."
docker compose down -v 2>/dev/null || true
docker compose up -d

echo "[3/4] Waiting for service to be healthy..."
MAX_WAIT=60
WAITED=0
until curl -sf http://localhost:3000/api/auth/me > /dev/null 2>&1; do
  sleep 2
  WAITED=$((WAITED + 2))
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Service did not start within ${MAX_WAIT}s"
    docker compose logs
    exit 1
  fi
done
echo "      Service is up! (waited ${WAITED}s)"

echo "[4/4] Running smoke tests..."
docker compose exec app sh -c "npm install --save-dev jest supertest && npx jest --forceExit --verbose" 2>&1

echo ""
echo "=== All smoke tests passed! ==="
echo "Access the app at: http://localhost:3000"
echo "Test accounts:"
echo "  就业管理员:  admin / admin123"
echo "  学院老师:    teacher1 / teacher123"
echo "  企业导师:    mentor1 / mentor123"
echo "  学生:        student1 / student123"
