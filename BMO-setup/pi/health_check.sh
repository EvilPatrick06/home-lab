#!/bin/bash
# BMO Health Check — runs via cron every 5 minutes
STATUS=0
MSG=""

# Check BMO service
if ! systemctl is-active --quiet bmo; then
    MSG+="BMO service is down. "
    STATUS=1
    sudo systemctl restart bmo
    MSG+="Attempted restart. "
fi

# Check web UI
if ! curl -sf http://localhost:5000/ > /dev/null 2>&1; then
    MSG+="Web UI not responding. "
    STATUS=1
fi

# Check Docker containers
for c in bmo-ollama bmo-peerjs; do
    running=$(docker inspect --format='{{.State.Running}}' "$c" 2>/dev/null)
    if [ "$running" != "true" ]; then
        MSG+="Docker $c is down. "
        STATUS=1
        docker start "$c" 2>/dev/null
    fi
done

# Check CPU temperature
TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
if [ -n "$TEMP" ]; then
    TEMP_C=$((TEMP / 1000))
    if [ "$TEMP_C" -gt 80 ]; then
        MSG+="CPU temp critical: ${TEMP_C}C. "
        STATUS=1
    fi
fi

# Check disk space
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 90 ]; then
    MSG+="Disk usage critical: ${DISK_PCT}%. "
    STATUS=1
fi

if [ "$STATUS" -ne 0 ]; then
    echo "[health] ALERT: $MSG"
fi

exit $STATUS
