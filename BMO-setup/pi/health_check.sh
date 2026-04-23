#!/bin/bash
# BMO Health Check — runs via cron every 5 minutes
STATUS=0
MSG=""
PI_HOSTNAME="${PI_HOSTNAME:-bmo}"

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

# Check mDNS hostname advertisement
if command -v avahi-resolve-host-name >/dev/null 2>&1; then
    if ! avahi-resolve-host-name "${PI_HOSTNAME}.local" >/dev/null 2>&1; then
        MSG+="mDNS hostname ${PI_HOSTNAME}.local not resolving. "
        STATUS=1
    fi
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

# Check Cloudflare tunnel health (if installed)
if systemctl list-unit-files --type=service 2>/dev/null | grep -q '^cloudflared\.service'; then
    if ! systemctl is-active --quiet cloudflared; then
        MSG+="cloudflared is down. "
        STATUS=1
        sudo systemctl restart cloudflared
        MSG+="Attempted cloudflared restart. "
    fi

    if [ -f /etc/cloudflared/config.yml ] && ! grep -q "service: http://localhost:5000" /etc/cloudflared/config.yml; then
        MSG+="cloudflared ingress does not target localhost:5000. "
        STATUS=1
    fi
fi

# Check Tailscale health (if installed)
if command -v tailscale >/dev/null 2>&1; then
    if ! tailscale status >/dev/null 2>&1; then
        MSG+="Tailscale installed but not connected. "
        STATUS=1
    fi
fi

if [ "$STATUS" -ne 0 ]; then
    echo "[health] ALERT: $MSG"
fi

exit $STATUS
