#!/bin/bash
# e2e_test.sh — End-to-end health test for all BMO services
#
# Usage:
#   bash e2e_test.sh              # Run all tests
#   bash e2e_test.sh --verbose    # Show response bodies
#
# Run from Pi or via SSH:
#   ssh patrick@10.10.20.242 "bash ~/bmo/e2e_test.sh"

set -uo pipefail

BMO_URL="http://localhost:5000"
OLLAMA_URL="http://localhost:11434"
PEERJS_URL="http://localhost:9000"
VERBOSE=false

for arg in "$@"; do
    case "$arg" in
        --verbose|-v) VERBOSE=true ;;
    esac
done

PASS=0
FAIL=0
SKIP=0
RESULTS=""

# ── Test Helpers ─────────────────────────────────────────────────────

pass() {
    PASS=$((PASS + 1))
    RESULTS+="  ✅ $1\n"
}

fail() {
    FAIL=$((FAIL + 1))
    RESULTS+="  ❌ $1 — $2\n"
}

skip() {
    SKIP=$((SKIP + 1))
    RESULTS+="  ⏭️  $1 — $2\n"
}

test_get() {
    local name="$1" url="$2"
    local resp code
    resp=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null)
    code=$?
    if [ "$code" -eq 0 ] && [ "$resp" = "200" ]; then
        pass "$name"
    elif [ "$code" -eq 0 ]; then
        fail "$name" "HTTP $resp"
    else
        fail "$name" "Connection failed (curl exit $code)"
    fi
}

test_post() {
    local name="$1" url="$2" data="$3"
    local resp code body
    body=$(curl -s -w "\n%{http_code}" --max-time 10 -X POST -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null)
    code=$(echo "$body" | tail -1)
    body=$(echo "$body" | sed '$d')
    if [ "$code" = "200" ]; then
        pass "$name"
        if $VERBOSE; then echo "    → $body"; fi
    else
        fail "$name" "HTTP $code"
        if $VERBOSE; then echo "    → $body"; fi
    fi
}

test_service_log() {
    local name="$1" pattern="$2"
    if journalctl -u bmo --no-pager -n 200 2>/dev/null | grep -q "$pattern"; then
        pass "$name (log check)"
    else
        skip "$name" "Pattern '$pattern' not found in recent logs"
    fi
}

echo "══════════════════════════════════════════════════════"
echo "  BMO End-to-End Service Tests"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════════"
echo ""

# ── 1. Core Infrastructure ──────────────────────────────────────────

echo "▸ Core Infrastructure"

# BMO Flask app
test_get "BMO Web UI (GET /)" "$BMO_URL/"

# Health endpoint
resp=$(curl -sf --max-time 5 "$BMO_URL/health" 2>/dev/null)
if [ $? -eq 0 ]; then
    pass "BMO Health (GET /health)"
    if $VERBOSE; then echo "    → $resp"; fi
else
    # Try without /health — some Flask apps don't have it
    test_get "BMO Health (GET /health)" "$BMO_URL/health"
fi

# Ollama
resp=$(curl -sf --max-time 5 "$OLLAMA_URL/api/tags" 2>/dev/null)
if [ $? -eq 0 ]; then
    pass "Ollama (GET /api/tags)"
    if $VERBOSE; then echo "    → $resp" | head -c 200; echo; fi
else
    fail "Ollama" "Not responding at $OLLAMA_URL"
fi

# PeerJS
test_get "PeerJS Signaling (GET /myapp)" "$PEERJS_URL/myapp"

# systemd service
if systemctl is-active --quiet bmo 2>/dev/null; then
    pass "BMO systemd service (active)"
else
    fail "BMO systemd service" "Not active"
fi

# Docker containers
for c in bmo-ollama bmo-peerjs; do
    running=$(docker inspect --format='{{.State.Running}}' "$c" 2>/dev/null)
    if [ "$running" = "true" ]; then
        pass "Docker: $c (running)"
    else
        fail "Docker: $c" "Not running"
    fi
done

echo ""

# ── 2. Chat & Agent ─────────────────────────────────────────────────

echo "▸ Chat & Agent"

test_post "Chat API (POST /api/chat)" "$BMO_URL/api/chat" '{"message":"ping","speaker":"test"}'
test_get "Chat History (GET /api/chat/history)" "$BMO_URL/api/chat/history"
test_get "Agent List (GET /api/agents)" "$BMO_URL/api/agents"
test_get "Scratchpad (GET /api/scratchpad)" "$BMO_URL/api/scratchpad"

echo ""

# ── 3. Music ─────────────────────────────────────────────────────────

echo "▸ Music"

test_get "Music State (GET /api/music/state)" "$BMO_URL/api/music/state"
test_get "Music Queue (GET /api/music/queue)" "$BMO_URL/api/music/queue"
test_get "Music Devices (GET /api/music/devices)" "$BMO_URL/api/music/devices"
test_get "Music History (GET /api/music/history)" "$BMO_URL/api/music/history"
test_get "Music Most Played (GET /api/music/most-played)" "$BMO_URL/api/music/most-played"

echo ""

# ── 4. Calendar ──────────────────────────────────────────────────────

echo "▸ Calendar"

test_get "Calendar Today (GET /api/calendar/today)" "$BMO_URL/api/calendar/today"
test_get "Calendar Events (GET /api/calendar/events)" "$BMO_URL/api/calendar/events"
test_get "Calendar Next (GET /api/calendar/next)" "$BMO_URL/api/calendar/next"

echo ""

# ── 5. Camera ────────────────────────────────────────────────────────

echo "▸ Camera"

test_get "Camera Objects (GET /api/camera/objects)" "$BMO_URL/api/camera/objects"
test_get "Camera Faces (GET /api/camera/faces)" "$BMO_URL/api/camera/faces"

echo ""

# ── 6. Weather ───────────────────────────────────────────────────────

echo "▸ Weather"

test_get "Weather (GET /api/weather)" "$BMO_URL/api/weather"

echo ""

# ── 7. Smart Home ────────────────────────────────────────────────────

echo "▸ Smart Home"

test_get "Devices (GET /api/devices)" "$BMO_URL/api/devices"

echo ""

# ── 8. Timers & Alarms ──────────────────────────────────────────────

echo "▸ Timers & Alarms"

test_get "Timers List (GET /api/timers)" "$BMO_URL/api/timers"

# Create and cancel a test timer
resp=$(curl -s -w "\n%{http_code}" --max-time 5 -X POST -H "Content-Type: application/json" \
    -d '{"seconds":9999,"label":"e2e-test"}' "$BMO_URL/api/timers/create" 2>/dev/null)
code=$(echo "$resp" | tail -1)
body=$(echo "$resp" | sed '$d')
if [ "$code" = "200" ]; then
    pass "Timer Create (POST /api/timers/create)"
    # Extract timer ID and cancel it
    timer_id=$(echo "$body" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
    if [ -n "$timer_id" ]; then
        cancel_code=$(curl -sf -o /dev/null -w "%{http_code}" --max-time 5 -X POST "$BMO_URL/api/timers/$timer_id/cancel" 2>/dev/null)
        if [ "$cancel_code" = "200" ]; then
            pass "Timer Cancel (POST /api/timers/<id>/cancel)"
        else
            fail "Timer Cancel" "HTTP $cancel_code"
        fi
    fi
else
    fail "Timer Create" "HTTP $code"
fi

echo ""

# ── 9. TV Remote ─────────────────────────────────────────────────────

echo "▸ TV Remote"

test_get "TV Status (GET /api/tv/status)" "$BMO_URL/api/tv/status"

echo ""

# ── 10. D&D Engine ───────────────────────────────────────────────────

echo "▸ D&D Engine"

test_get "DnD Sessions (GET /api/dnd/sessions)" "$BMO_URL/api/dnd/sessions"
test_get "DnD Game State (GET /api/dnd/gamestate)" "$BMO_URL/api/dnd/gamestate"
test_get "DnD Players (GET /api/dnd/players)" "$BMO_URL/api/dnd/players"

echo ""

# ── 11. Notes ────────────────────────────────────────────────────────

echo "▸ Notes"

test_get "Notes List (GET /api/notes)" "$BMO_URL/api/notes"

echo ""

# ── 12. Settings ─────────────────────────────────────────────────────

echo "▸ Settings"

test_get "Settings (GET /api/settings)" "$BMO_URL/api/settings"

echo ""

# ── 13. LEDs ─────────────────────────────────────────────────────────

echo "▸ Hardware (LEDs)"

test_post "LED State (POST /api/led/state)" "$BMO_URL/api/led/state" '{"state":"ready"}'

echo ""

# ── 14. Service Init Checks (from journalctl) ───────────────────────

echo "▸ Service Init (log checks)"

test_service_log "Voice pipeline" "Voice pipeline: OK\|Voice pipeline: SKIPPED"
test_service_log "Camera" "Camera: OK\|Camera: SKIPPED"
test_service_log "LED controller" "LED controller: OK\|LED controller: SKIPPED"
test_service_log "OLED face" "oled\|OLED"
test_service_log "Agent" "Agent: OK"

echo ""

# ── Results Summary ──────────────────────────────────────────────────

echo "══════════════════════════════════════════════════════"
echo "  Results: ✅ $PASS passed | ❌ $FAIL failed | ⏭️  $SKIP skipped"
echo "══════════════════════════════════════════════════════"
echo ""
echo -e "$RESULTS"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
