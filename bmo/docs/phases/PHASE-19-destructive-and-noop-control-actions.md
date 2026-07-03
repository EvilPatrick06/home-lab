# PHASE-19 — bmo destructive & no-op control-action truth (calendar delete, unmute CTA, camera offline, OLED disabled)

> Authored 2026-07-02 from `bmo/docs/phases/QA/QA-report-2026-07-02.md` (run 4, live deploy `4c7bcd82`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md).

## Goal

Fix the four findings where a dashboard control either **destroys real data with one tap** or **claims/implies success while doing nothing**:

1. **Calendar "Del" deletes a real Google Calendar event instantly** — no confirm, no undo, no toast delay. On a wall-mounted touch display an accidental tap silently destroys a real calendar entry (verified round-trip by QA: created + deleted a test event in ~2 s). *(medium)*
2. **The "Unmute" banner CTA cannot fix the condition it warns about.** The silent-play banner fires for `volume==0` OR `muted`, but the CTA only calls `/api/audio/unmute` (clears the PipeWire mute flag). With the sink unmuted at volume 0.00, the click is a silent no-op: banner stays, no feedback, still no sound. *(medium)*
3. **Camera panel leaks a raw Python exception and Snap "fails silently" when the camera is offline.** Describe renders `Vision failed: NoneType object has no attribute describe_scene`; Snap's error toast actually fires but is **painted behind the full-screen camera overlay** (same `z-50`, later DOM sibling), so the user sees nothing. *(medium)*
4. **Face expression POST "succeeds" while the OLED is disabled** (`BMO_DISABLE_OLED`): `POST /api/oled/expression` returns `{"ok": true, "expression": "happy"}` but `GET` still says `idle` and nothing happens; the UI never hints the face display is off. *(low)*

Common thread: the UI must tell the truth about what an action did (or cannot do) — the same "truth" line as PHASE-10/16/17.

PLANNING/AUTHORING ONLY. Categories: **UX (medium×3, low×1)** — gated on the status board per the autonomy policy (not auto-implemented). Mixed frontend (`bmo.js`/`index.html`) + small backend guards (`app.py`); backend parts are pytest-coverable.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Verified against `origin/master@b1128097`; the web frontend is unchanged between the tested deploy `4c7bcd82` and HEAD (only `app.py` gained the source-gate install, disjoint). Re-anchor line numbers before editing (rule 3).
- **The silent-play banner condition is intentional** (Phase 39c per the QA note): triggering on `volume==0` with adaptive copy is by design — only the CTA action was never split the same way. 19B changes the action + label, not the trigger.
- **Camera Snap error surfacing already exists** (`cameraSnap()` was fixed in Round 2 #19) — the QA-visible "silence" is a **z-order bug**, not missing code. 19C therefore fixes stacking/disabled-state, plus the one genuinely missing backend guard (`/api/camera/describe` with `camera is None`).
- **Frontend has no JS unit harness**; backend guards get pytest coverage (`test_app_endpoints.py` patterns), frontend changes are diff-reviewed + acceptance-walked on the owner-run deploy (rule 6 — no live-Pi mutation).

## Verified findings

All citations verified 2026-07-02 against `origin/master@b1128097`.

### F1 — Calendar Del is wired straight to `DELETE /api/calendar/delete/<id>` with no confirm/undo

**Status: confirmed (Medium/UX).** The agenda row button:

```html
<button @click.stop="deleteCalEvent(event.id)" class="text-sm text-red-400 …">Del</button>
```

(`bmo/pi/web/templates/index.html:1148`.) The handler deletes immediately:

```js
async deleteCalEvent(eventId) {
  if (!eventId) return;
  try {
    await fetch(`/api/calendar/delete/${eventId}`, { method: 'DELETE' });
    …
    this.showNotification('Event deleted');
```

(`bmo/pi/web/static/js/bmo.js:2139-2148`.) The backend route (`bmo/pi/routes/calendar_api.py:162-172`) deletes from the linked Google Calendar. No confirmation, no undo window, notification only after the fact.

```bash
grep -n 'deleteCalEvent' bmo/pi/web/templates/index.html bmo/pi/web/static/js/bmo.js
sed -n '162,172p' bmo/pi/routes/calendar_api.py
```

### F2 — Banner CTA maps both trigger conditions to the mute-only endpoint

**Status: confirmed (Medium/UX).** The banner adapts its **copy** but not its **action**:

```html
<span x-text="(volumeLevels?.system === 0 && !volumeLevels?.muted) ? '🔈 Master volume is 0% — …' : '🔇 System audio is muted — …'"></span>
<button @click="fetch('/api/audio/unmute',{method:'POST'}).then(()=>fetchControlsData())" …>Unmute</button>
```

(`bmo/pi/web/templates/index.html:35-37`.) `POST /api/audio/unmute` only clears the sink mute flag (`bmo/pi/routes/system_api.py:661-667`, `system_audio.unmute_sink()` → `wpctl set-mute 0`); it never touches volume. `POST /api/volume {category:"system", level:N}` exists two routes down (`system_api.py:670-681`) and is the correct call for the volume-0 case. With `volume.system: 0` persisted, the click is a no-op with no feedback.

```bash
sed -n '33,38p' bmo/pi/web/templates/index.html
sed -n '661,690p' bmo/pi/routes/system_api.py
```

### F3 — `/api/camera/describe` never guards `camera is None`; Snap's error toast is stacked beneath the camera overlay

**Status: confirmed (Medium/UX), root cause refined vs. the report.** Two distinct defects:

**(a) Describe:** `api_camera_stream`/`api_camera_snapshot` both start with `if not camera: return …503` (`bmo/pi/app.py:1365-1378`), but `api_camera_describe` (`:1417-1449`) does **not** — it spawns `_do_describe()` which calls `camera.describe_scene(prompt)` on `None` → `AttributeError: 'NoneType' object has no attribute 'describe_scene'`. The except-branch's message classifier (`:1436-1444`) matches none of its patterns for that text, so the fallback `description = f"Vision failed: {str(e)[:120]}"` ships the raw exception to the UI via the `vision_result` socket event. The route even returns `{"ok": true, "message": "Describing..."}` first.

**(b) Snap:** `cameraSnap()` **does** surface backend errors (`bmo.js:3166-3191`, added Round 2 #19: `showNotification('Snapshot failed: …', 'error')`). But the toast container is `fixed top-0 … z-50` at `index.html:2080`, while the full-screen camera overlay is `fixed inset-0 bg-surface-dark z-50` at `index.html:2094` — equal z-index, and the overlay is a **later DOM sibling**, so it paints on top. Every toast fired while the camera overlay is open is invisible. (This also swallows any other toast fired from inside the overlay, e.g. motion-toggle failures at `bmo.js:2336-2355`.)

**(c) No disabled affordance:** the Snap/Describe (and motion) buttons at `index.html:2101-2102` stay fully enabled next to the "Camera offline" label (`:2097`, `x-show="!cameraActive"`).

```bash
sed -n '1365,1380p' bmo/pi/app.py      # stream/snapshot have the None-guard
sed -n '1417,1450p' bmo/pi/app.py      # describe does not
grep -n 'z-50' bmo/pi/web/templates/index.html | sed -n '1,12p'   # :2080 toast vs :2094 overlay
sed -n '2094,2104p' bmo/pi/web/templates/index.html
```

### F4 — OLED expression set echoes success unconditionally; GET contradicts it when the face is disabled

**Status: confirmed (Low/UX).**

```python
@app.route("/api/oled/expression", methods=["POST"])
def api_oled_expression_set():
    data = request.get_json(silent=True) or {}
    expression = data.get("expression", "idle")
    _sync_expression(expression)
    return jsonify({"ok": True, "expression": expression})   # echoes the REQUEST
```

(`bmo/pi/app.py:1718-1724`.) `_sync_expression`'s consumers all None-guard `oled_face`, so with `BMO_DISABLE_OLED` set the call is a no-op; the GET reads reality (`oled_face.current_expression if oled_face else "idle"`, `:1712-1715`) and immediately contradicts the POST. The Settings face picker (`bmo.js:2270-2284`) then toasts "Face set to happy" — trusting the false `ok`. Contrast: the camera panel does show "Camera offline".

```bash
sed -n '1710,1726p' bmo/pi/app.py
grep -n 'BMO_DISABLE_OLED' bmo/pi/app.py | head
```

## Sub-phases

> One commit at phase end. Backend steps get targeted pytest; frontend steps are diff-review + acceptance walk (no JS harness).

### 19A — Confirm-or-undo for calendar event deletion

**Objective:** one tap can no longer destroy a real Google Calendar event; the flow works on a touch display.

**Files:** `bmo/pi/web/templates/index.html` (`:1148` and the sibling Del in the day/edit views if present), `bmo/pi/web/static/js/bmo.js` (`deleteCalEvent`, `:2139`).

**Steps:**

1. Add a lightweight two-step confirm in `deleteCalEvent`: first tap arms the row (button text → "Sure?", auto-disarm after ~4 s via a per-event `confirmingDeleteId` in Alpine state); second tap within the window performs the DELETE. This is touch-friendly (no browser `confirm()` modal, which is ugly on the kiosk) and needs no new endpoint.
2. Keep the existing "Event deleted" toast; also disarm on `@click.away`/tab switch.
3. Sweep for any other single-tap destructive calendar affordances (search `calendar/delete` callers) and apply the same arming pattern.

**Cheap check:** diff review; browser walk — first tap arms, second deletes, waiting 4 s disarms.

**Acceptance:** deleting an event requires two intentional taps within a short window; a single accidental tap changes nothing on the backing calendar.

### 19B — Make the silent-play CTA fix whichever condition triggered the banner

**Objective:** the banner's button resolves the actual state — restores an audible volume when `volume==0`, unmutes when muted — with feedback either way.

**Files:** `bmo/pi/web/templates/index.html` (`:33-38`), `bmo/pi/web/static/js/bmo.js` (new small handler; keep template logic thin).

**Steps:**

1. Replace the inline `@click` with a `fixSilentPlayback()` method in `bmo.js`: if `volumeLevels?.muted`, POST `/api/audio/unmute`; if `volumeLevels?.system === 0` (independently — both can hold), POST `/api/volume` with `{category:"system", level:30}` (30% floor, matching the alarm-warning convention at `bmo.js:2426`). Then `fetchControlsData()` and toast the outcome ("Volume restored to 30%" / "Unmuted"), or an error toast on failure.
2. Adapt the button label with the same ternary the copy already uses: "Unmute" when muted, "Raise volume" when volume-0.
3. No backend change: both endpoints exist (`system_api.py:661`, `:670`). (If the executer prefers a one-call fix, extending `/api/audio/unmute` to accept `{restore_volume: N}` is acceptable — then add a pytest for it — but the two-call frontend fix is the minimal path.)

**Cheap check:** with `volume.system: 0` persisted, click → volume becomes 30, banner clears, toast shown; with sink muted, click → unmuted, banner clears.

**Acceptance:** the CTA resolves both trigger conditions, gives feedback, and the banner self-clears; label matches the state.

### 19C — Camera-offline truth: guard describe server-side, fix toast stacking, disable capture buttons

**Objective:** no raw exception text reaches the UI; toasts fired over the camera overlay are visible; offline state disables what cannot work.

**Files:** `bmo/pi/app.py` (`api_camera_describe`, `:1417`), `bmo/pi/web/templates/index.html` (`:2080`, `:2094-2104`), `bmo/pi/web/static/js/bmo.js` (`cameraDescribe` `:2303`).

**Steps:**

1. **Backend:** add the same guard the sibling routes use at the top of `api_camera_describe`: `if not camera: return jsonify({"error": "Camera is offline — cannot describe right now"}), 503`. `cameraDescribe()` already renders `data.error` on non-OK (`bmo.js:2315-2321`), so the friendly copy flows through with no JS change. Also harden the thread's fallback: add a `NoneType`/`describe_scene` pattern → "Vision unavailable: camera hardware not detected." so a mid-flight `camera` teardown can't leak raw text either.
2. **Stacking:** raise the notification toast container (`index.html:2080`) above the overlay tier — e.g. `z-[60]` if the built Tailwind CSS contains it, otherwise a one-line style/class present in the purged CSS (**check `bmo/pi/web/static/css/tailwind.css` first** — PHASE-17 17B established that unbuilt utility classes are silent no-ops; an inline `style="z-index:60"` is the safe fallback). Toasts must beat both `z-50` overlays (camera `:2094`, snap preview `:2113`).
3. **Disabled affordance:** on the camera panel (`:2101-2102`), bind `:disabled="!cameraActive"` + a dimmed class on Snap/Describe (and the motion toggle in that panel), mirroring the "Camera offline" label's condition.
4. **Pytest:** extend the app-endpoint tests: with `camera = None`, `POST /api/camera/describe` → 503 with the friendly error string (today it 200s and crashes in a daemon thread).

**Cheap check:** `python -m pytest tests/test_app_endpoints.py -q`; browser walk with no camera: buttons disabled + friendly copy; force a Snap → visible toast over the overlay.

**Acceptance:** offline Describe returns a clean 503 message end-to-end (no `NoneType` text anywhere); Snap/Describe are disabled while offline; error toasts render above the camera overlay.

### 19D — OLED expression API reports reality when the face is disabled

**Objective:** the POST response and the UI reflect whether the expression was actually applied.

**Files:** `bmo/pi/app.py` (`:1712-1724`), `bmo/pi/web/static/js/bmo.js` (`setFaceExpression`/03G handler, `:2270-2284`), `bmo/pi/web/templates/index.html` (Face section).

**Steps:**

1. In `api_oled_expression_set`, detect the disabled case (`oled_face is None`) and return `{"ok": true, "applied": false, "disabled": true, "expression": expression}` (keep `ok: true`/200 — nothing *failed*; the LED sync via `_sync_expression` may still have applied — this mirrors how the GET already None-guards). Include `"applied": true` in the normal path.
2. In the face-picker handler, branch on `applied === false` → informational toast "Face display is disabled on this device" instead of "Face set to happy".
3. Optionally surface a persistent hint in the Face section (`x-show` on a `faceDisabled` flag seeded from the first response or from `/api/v1/health` if it already exposes the flag — check before adding new plumbing).
4. **Pytest:** with `oled_face = None`, POST → `applied: false, disabled: true`; GET stays `idle`. With a mock face, POST → `applied: true`.

**Cheap check:** `python -m pytest tests/test_app_endpoints.py -q` (or the face-state test module, `tests/test_face_state.py`).

**Acceptance:** with `BMO_DISABLE_OLED`, tapping a Face button yields the "disabled" toast and the API says `applied: false`; with hardware present, behavior is unchanged and `applied: true`.

## Test plan

- **Backend (19C step 1/4, 19D):** targeted pytest in `tests/test_app_endpoints.py` / `tests/test_face_state.py`; full `python -m pytest` green; `ruff check`; no new `print()`s.
- **Frontend (19A, 19B, 19C steps 2-3):** no JS harness — careful diff + browser acceptance walk (kiosk 1024×600 and desktop): arm/confirm delete, banner CTA in both trigger states, camera-offline panel, face picker with OLED disabled. Confirmed on the owner-run deploy (rule 6).

## Acceptance criteria

1. Calendar deletion requires an explicit second confirmation tap; accidental single taps are inert.
2. The silent-play CTA resolves both the muted and the volume-0 condition with visible feedback, and its label matches the state.
3. Camera-offline: Describe returns friendly copy end-to-end, Snap/Describe are disabled, and toasts are visible above the camera overlay.
4. `POST /api/oled/expression` reports `applied`/`disabled` truthfully and the face picker relays it.
5. `bmo-pi-pytest.yml` green; one commit; plan moved to `completed/`.

## Out of scope

- **Undo (restore-deleted-event) support** — would need a new backend endpoint + Google Calendar re-insert semantics; the arming confirm covers the QA risk. Log as a future-idea if desired.
- **The banner trigger condition itself** — intentional per Phase 39c; unchanged.
