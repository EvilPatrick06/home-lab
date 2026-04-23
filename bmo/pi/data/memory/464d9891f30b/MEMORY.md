
## Audio Output
Pi 5 audio output: HDMI-0 (vc4-hdmi-0) via PipeWire. No 3.5mm jack on Pi 5.
- HDMI card: alsa_card.platform-107c701400.hdmi, must be set to profile "hdmi-stereo" (not "pro-audio")
- Bluetooth A10 speaker (B0:8E:31:0E:C0:3A) is paired but often offline → causes Dummy Output fallback
- WirePlumber config: ~/.config/wireplumber/wireplumber.conf.d/50-hdmi-audio.conf and 51-hdmi-default.conf
- WirePlumber state: ~/.local/state/wireplumber/default-profile and default-nodes
- Startup service: bmo-hdmi-audio.service (user) runs hdmi-audio.sh to activate HDMI sink
- Fix applied 2026-03-13: Set HDMI as default configured sink (was Bluetooth A10), profile set to hdmi-stereo
- Volume sliders work correctly via /api/volume GET/POST, settings persisted in data/settings.json under volume.*
