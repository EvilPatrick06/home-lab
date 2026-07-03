# bmo cron replacements for retired Claude scheduled tasks

Deterministic cron jobs on bmo (no LLM, except the Gemini briefs which call
Gemini for prose only). Install for the `patrick` user with `crontab -e`. Times
are bmo LOCAL time. See `docs/SCHEDULED-TASK-MIGRATION.md` for the retire steps.

```cron
# stale-branch-pruner (local half) — weekly Sun 04:00
0 4 * * 0 /home/patrick/home-lab/bmo/pi/scripts/stale-local-cleanup.sh >> /home/patrick/home-lab/bmo/pi/data/logs/cron-cleanup.log 2>&1

# calendar-conflict-watch — weekly Mon 07:00
0 7 * * 1 /home/patrick/home-lab/bmo/pi/scripts/cron/calendar-conflict-watch.sh >> /home/patrick/home-lab/bmo/pi/data/logs/cron-calendar.log 2>&1

# severe-weather-alert — 06:00 & 15:00 daily
0 6,15 * * * /home/patrick/home-lab/bmo/pi/scripts/cron/severe-weather-alert.sh >> /home/patrick/home-lab/bmo/pi/data/logs/cron-weather.log 2>&1

# weekday-morning-brief — 06:00 daily (needs GEMINI_API_KEY in bmo/pi/.env)
0 6 * * * /home/patrick/home-lab/bmo/pi/scripts/cron/weekday-morning-brief.sh >> /home/patrick/home-lab/bmo/pi/data/logs/cron-brief.log 2>&1

# evening-winddown — 20:00 daily (needs GEMINI_API_KEY in bmo/pi/.env)
0 20 * * * /home/patrick/home-lab/bmo/pi/scripts/cron/evening-winddown.sh >> /home/patrick/home-lab/bmo/pi/data/logs/cron-winddown.log 2>&1
```

Each script resolves its board data dir the same way `notify-board` does and posts
via `/home/patrick/bmo-board/notify-board`. They are safe to install before their
Claude counterparts are paused — running both briefly just double-posts to the
same keyed board namespace (idempotent, re-synced each run).
