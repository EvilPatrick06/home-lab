#!/bin/bash
# Activate HDMI audio on the Freenove Audio-Video Board
# Runs as a systemd user service after WirePlumber starts
sleep 3

# Find HDMI-0 device ID by name
HDMI_DEV=$(pw-cli list-objects Device 2>/dev/null | grep -oP 'id \K[0-9]+(?=.*alsa_card.platform-107c701400.hdmi)' | head -1)

# Fallback: search line by line
if [ -z "$HDMI_DEV" ]; then
    HDMI_DEV=$(pw-cli list-objects Device 2>/dev/null | tr '\n' '|' | grep -oP 'id ([0-9]+)[^|]*(?:\|[^|]*)*?alsa_card\.platform-107c701400\.hdmi' | head -1 | grep -oP '^id \K[0-9]+')
fi

# Last resort: use pw-dump
if [ -z "$HDMI_DEV" ]; then
    HDMI_DEV=$(pw-dump 2>/dev/null | python3 -c "
import json, sys
for obj in json.load(sys.stdin):
    props = obj.get('info', {}).get('props', {})
    if props.get('device.name') == 'alsa_card.platform-107c701400.hdmi':
        print(obj['id'])
        break
" 2>/dev/null)
fi

if [ -n "$HDMI_DEV" ]; then
    wpctl set-profile "$HDMI_DEV" 1
    sleep 1
    SINK=$(wpctl status 2>/dev/null | grep 'Built-in Audio Digital Stereo' | head -1 | grep -oP '[0-9]+' | head -1)
    if [ -n "$SINK" ]; then
        wpctl set-default "$SINK"
        wpctl set-volume "$SINK" 0.50
        echo "HDMI audio: device=$HDMI_DEV sink=$SINK vol=50%"
    else
        echo "HDMI sink not found"
    fi
else
    echo "HDMI device not found"
fi
