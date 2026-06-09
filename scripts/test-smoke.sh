#!/usr/bin/env bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
RESET='\033[0m'

pass() { echo -e "${GREEN}✓${RESET} $1"; }
fail() { echo -e "${RED}✗${RESET} $1"; exit 1; }

status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:1633/health)
[ "$status" -eq 200 ] && pass "bee factory is healthy" || fail "service is not healthy. HTTP status code: $status"

output=$(swarm-cli utility rchash)
echo "$output" | grep -q "Reserve sampling duration" && pass "rchash works" || fail "rchash output missing 'Reserve sampling duration'"

cheque_count=$(curl -s http://localhost:1637/chequebook/cheque | jq '[.lastcheques[] | select(.lastreceived != null)] | length')
[ "$cheque_count" -le 1 ] && pass "cheque created on node 1637" || fail "node on port 1637 has no received cheques"
