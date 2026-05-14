#!/usr/bin/env bash
set -e

status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1633/health)

if [ "$status" -eq 200 ]; then
  echo "Bee factory is healthy."
else
  echo "Test failed: Service is not healthy. HTTP status code: $status"
  exit 1
fi
