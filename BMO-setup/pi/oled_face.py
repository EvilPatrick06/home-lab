"""BMO OLED Face — Animated pixel-art BMO face with expression state machine.

128x64 pixel display using luma.oled. Renders dynamic expressions reflecting BMO's state.
Triggered by SocketIO events from the Flask app.
"""

import os
import threading
import time
from enum import Enum

try:
    from luma.core.interface.serial import i2c
    from luma.oled.device import ssd1306
    from PIL import Image, ImageDraw, ImageFont
    OLED_AVAILABLE = True
except ImportError:
    OLED_AVAILABLE = False

# Display dimensions
WIDTH = 128
HEIGHT = 64
FPS = 10
FRAME_DELAY = 1.0 / FPS


class Expression(Enum):
    """BMO face expressions."""
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    HAPPY = "happy"
    ERROR = "error"
    ALERT = "alert"
    COMBAT = "combat"
    SLEEPING = "sleeping"
    LAUGHING = "laughing"
    SCARED = "scared"
    SURPRISED = "surprised"
    LOVE = "love"
    CONFUSED = "confused"
    SINGING = "singing"
    SHY = "shy"
    WINK = "wink"
    MISCHIEVOUS = "mischievous"
    WARMUP = "warmup"
    CAPTURING = "capturing"


class OledFace:
    """Animated pixel-art BMO face on 128x64 OLED display.

    State machine for expressions. 10 FPS animation loop.
    Expressions are triggered by SocketIO events or direct API calls.
    """

    # Priority order for expression debouncing — higher value wins
    _EXPRESSION_PRIORITY = {
        Expression.IDLE: 0,
        Expression.SLEEPING: 0,
        Expression.LISTENING: 1,
        Expression.THINKING: 2,
        Expression.SPEAKING: 3,
        Expression.HAPPY: 2,
        Expression.ERROR: 3,
        Expression.ALERT: 3,
        Expression.COMBAT: 2,
        Expression.LAUGHING: 2,
        Expression.SCARED: 3,
        Expression.SURPRISED: 3,
        Expression.LOVE: 2,
        Expression.CONFUSED: 1,
        Expression.SINGING: 2,
        Expression.SHY: 1,
        Expression.WINK: 2,
        Expression.MISCHIEVOUS: 2,
        Expression.WARMUP: 1,
        Expression.CAPTURING: 2,
    }
    _DEBOUNCE_MS = 200

    # Variable FPS per expression state (brenpoly pattern)
    _STATE_FPS = {
        Expression.SPEAKING: 20,
        Expression.LAUGHING: 15,
        Expression.SINGING: 15,
        Expression.IDLE: 5,
        Expression.SLEEPING: 3,
    }
    _DEFAULT_FPS = 10

    def __init__(self, socketio=None):
        self.socketio = socketio
        self._device = None
        self._expression = Expression.IDLE
        self._running = False
        self._render_thread = None
        self._frame_counter = 0
        self._blink_timer = 0
        self._blink_state = False
        self._mouth_state = 0  # 0=closed, 1=half, 2=open
        self._thinking_angle = 0
        self._alert_flash = False
        self._look_offset = 0  # -1=left, 0=center, 1=right for idle look-around
        self._look_target = 0  # target for smooth interpolation
        self._look_timer = 0
        self._last_expression_time = 0.0
        self._audio_volume = 0  # 0-100, set externally for volume-reactive mouth
        self._warmup_angle = 0

    def start(self):
        """Initialize OLED and start the animation loop."""
        if not OLED_AVAILABLE:
            print("[oled] luma.oled not available — running headless")
            return

        try:
            serial = i2c(port=1, address=0x3C)
            self._device = ssd1306(serial, width=WIDTH, height=HEIGHT)
            self._device.contrast(200)
        except Exception as e:
            print(f"[oled] Failed to init display: {e}")
            return

        self._running = True
        self._render_thread = threading.Thread(target=self._animation_loop, daemon=True)
        self._render_thread.start()
        print("[oled] BMO face started")

    def stop(self):
        """Stop the animation loop and clear display."""
        self._running = False
        if self._device:
            self._device.hide()

    def set_expression(self, expression: str):
        """Change BMO's expression with debouncing.

        Ignores expression changes that arrive within 200ms of the last change,
        UNLESS the new expression has higher priority (speaking > thinking > listening > idle).
        This prevents rapid state flicker while ensuring important transitions aren't dropped.
        """
        try:
            new_expr = Expression(expression)
        except ValueError:
            print(f"[oled] Unknown expression: {expression}")
            return

        now = time.monotonic()
        elapsed_ms = (now - self._last_expression_time) * 1000

        if elapsed_ms < self._DEBOUNCE_MS:
            new_pri = self._EXPRESSION_PRIORITY.get(new_expr, 0)
            cur_pri = self._EXPRESSION_PRIORITY.get(self._expression, 0)
            if new_pri <= cur_pri:
                return  # debounced — lower or equal priority within window

        self._expression = new_expr
        self._frame_counter = 0
        self._last_expression_time = now

    @property
    def current_expression(self) -> str:
        return self._expression.value

    def set_audio_volume(self, volume: int):
        """Set current audio volume (0-100) for volume-reactive mouth animation."""
        self._audio_volume = max(0, min(100, volume))

    # ── Animation Loop ────────────────────────────────────────────────

    def _animation_loop(self):
        """Main render loop with variable FPS per expression state."""
        while self._running:
            start = time.time()

            img = Image.new("1", (WIDTH, HEIGHT), 0)
            draw = ImageDraw.Draw(img)

            self._render_frame(draw)

            if self._device:
                self._device.display(img)

            self._frame_counter += 1
            fps = self._STATE_FPS.get(self._expression, self._DEFAULT_FPS)
            target_delay = 1.0 / fps
            elapsed = time.time() - start
            sleep_time = max(0, target_delay - elapsed)
            time.sleep(sleep_time)

    def _render_frame(self, draw: "ImageDraw.Draw"):
        """Render the current expression frame."""
        expr = self._expression

        if expr == Expression.IDLE:
            self._render_idle(draw)
        elif expr == Expression.LISTENING:
            self._render_listening(draw)
        elif expr == Expression.THINKING:
            self._render_thinking(draw)
        elif expr == Expression.SPEAKING:
            self._render_speaking(draw)
        elif expr == Expression.HAPPY:
            self._render_happy(draw)
        elif expr == Expression.ERROR:
            self._render_error(draw)
        elif expr == Expression.ALERT:
            self._render_alert(draw)
        elif expr == Expression.COMBAT:
            self._render_combat(draw)
        elif expr == Expression.SLEEPING:
            self._render_sleeping(draw)
        elif expr == Expression.LAUGHING:
            self._render_laughing(draw)
        elif expr == Expression.SCARED:
            self._render_scared(draw)
        elif expr == Expression.SURPRISED:
            self._render_surprised(draw)
        elif expr == Expression.LOVE:
            self._render_love(draw)
        elif expr == Expression.CONFUSED:
            self._render_confused(draw)
        elif expr == Expression.SINGING:
            self._render_singing(draw)
        elif expr == Expression.SHY:
            self._render_shy(draw)
        elif expr == Expression.WINK:
            self._render_wink(draw)
        elif expr == Expression.MISCHIEVOUS:
            self._render_mischievous(draw)
        elif expr == Expression.WARMUP:
            self._render_warmup(draw)
        elif expr == Expression.CAPTURING:
            self._render_capturing(draw)

    # ── Expression Renderers ──────────────────────────────────────────

    def _render_idle(self, draw):
        """Neutral face with slow blink and smooth look-around."""
        # Blink every ~8 seconds at 5 FPS (40 frames)
        self._blink_timer += 1
        if self._blink_timer >= 40:
            self._blink_state = True
            if self._blink_timer >= 42:
                self._blink_state = False
                self._blink_timer = 0

        # Smooth look-around: pick a new target every ~16s, interpolate toward it
        self._look_timer += 1
        if self._look_timer >= 80:
            import random
            self._look_target = random.choice([-1, 0, 0, 1])
            if self._look_timer >= 100:
                self._look_target = 0
                self._look_timer = 0
        # Smooth interpolation toward target (0.15 per frame)
        diff = self._look_target - self._look_offset
        if abs(diff) > 0.05:
            self._look_offset += diff * 0.15
        else:
            self._look_offset = self._look_target
        pupil_shift = int(self._look_offset * 3)

        # Face outline
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Eyes
        if self._blink_state:
            # Blink — horizontal lines
            draw.line([35, 25, 50, 25], fill=1, width=2)
            draw.line([78, 25, 93, 25], fill=1, width=2)
        else:
            # Open eyes — oval
            draw.ellipse([35, 18, 50, 32], outline=1, fill=1)
            draw.ellipse([78, 18, 93, 32], outline=1, fill=1)
            # Pupils (shifted by look direction)
            draw.ellipse([40 + pupil_shift, 22, 45 + pupil_shift, 28], outline=0, fill=0)
            draw.ellipse([83 + pupil_shift, 22, 88 + pupil_shift, 28], outline=0, fill=0)

        # Mouth — small neutral line
        draw.line([52, 44, 76, 44], fill=1, width=1)

    def _render_listening(self, draw):
        """Wide eyes with ear dots and mic indicators."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Wide open eyes
        draw.ellipse([32, 14, 52, 34], outline=1, fill=1)
        draw.ellipse([76, 14, 96, 34], outline=1, fill=1)
        # Large pupils
        draw.ellipse([38, 20, 46, 28], outline=0, fill=0)
        draw.ellipse([82, 20, 90, 28], outline=0, fill=0)

        # Small 'o' mouth (attentive)
        draw.ellipse([58, 40, 70, 50], outline=1, fill=0)

        # Ear dots (perked) — small dots on the sides of the face
        phase = self._frame_counter % 10
        pulse = phase < 5
        draw.ellipse([14, 18, 18, 22], fill=1)
        draw.ellipse([14, 26, 18, 30], fill=1)
        draw.ellipse([110, 18, 114, 22], fill=1)
        draw.ellipse([110, 26, 114, 30], fill=1)

        # Mic indicator — pulsing arcs on the sides
        if pulse:
            draw.arc([2, 20, 12, 44], start=270, end=90, fill=1)
            draw.arc([116, 20, 126, 44], start=90, end=270, fill=1)

    def _render_thinking(self, draw):
        """Eyes looking up-right with rotating dots."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Eyes looking up-right
        draw.ellipse([35, 18, 50, 32], outline=1, fill=1)
        draw.ellipse([78, 18, 93, 32], outline=1, fill=1)
        # Pupils shifted up-right
        draw.ellipse([43, 19, 48, 25], outline=0, fill=0)
        draw.ellipse([86, 19, 91, 25], outline=0, fill=0)

        # Slight frown (thinking hard)
        draw.arc([50, 44, 78, 54], start=180, end=360, fill=1, width=1)

        # Rotating dots
        import math
        cx, cy = 64, 46
        radius = 8
        num_dots = 3
        self._thinking_angle += 0.3
        for i in range(num_dots):
            angle = self._thinking_angle + (i * 2 * math.pi / num_dots)
            x = int(cx + radius * math.cos(angle))
            y = int(cy + radius * math.sin(angle))
            size = 3 if i == 0 else 2
            draw.ellipse([x - size, y - size, x + size, y + size], fill=1)

    def _render_speaking(self, draw):
        """Happy eyes with volume-reactive mouth animation."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        draw.arc([33, 16, 52, 34], start=200, end=340, fill=1, width=2)
        draw.arc([76, 16, 95, 34], start=200, end=340, fill=1, width=2)

        # Volume-reactive mouth: audio_volume drives mouth size
        vol = self._audio_volume
        if vol < 10:
            draw.line([52, 44, 76, 44], fill=1, width=1)
        elif vol < 40:
            draw.ellipse([54, 40, 74, 48], outline=1, fill=0)
        elif vol < 70:
            draw.ellipse([52, 38, 76, 50], outline=1, fill=0)
        else:
            draw.ellipse([50, 36, 78, 52], outline=1, fill=0)

    def _render_happy(self, draw):
        """Smile with squinted eyes."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Squinted happy eyes (upward arcs)
        draw.arc([32, 16, 53, 36], start=200, end=340, fill=1, width=2)
        draw.arc([75, 16, 96, 36], start=200, end=340, fill=1, width=2)

        # Big smile
        draw.arc([40, 32, 88, 56], start=0, end=180, fill=1, width=2)

    def _render_error(self, draw):
        """X eyes with frown."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # X eyes
        draw.line([35, 18, 50, 32], fill=1, width=2)
        draw.line([50, 18, 35, 32], fill=1, width=2)
        draw.line([78, 18, 93, 32], fill=1, width=2)
        draw.line([93, 18, 78, 32], fill=1, width=2)

        # Frown
        draw.arc([40, 42, 88, 58], start=180, end=360, fill=1, width=2)

    def _render_alert(self, draw):
        """Exclamation mark with flashing border."""
        self._alert_flash = not self._alert_flash

        if self._alert_flash:
            draw.rectangle([8, 2, 120, 62], outline=1)
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Alert eyes (wide, worried)
        draw.ellipse([32, 14, 52, 34], outline=1, fill=1)
        draw.ellipse([76, 14, 96, 34], outline=1, fill=1)
        draw.ellipse([38, 18, 46, 30], outline=0, fill=0)
        draw.ellipse([82, 18, 90, 30], outline=0, fill=0)

        # Exclamation mark below eyes
        draw.rectangle([62, 38, 66, 50], fill=1)
        draw.rectangle([62, 53, 66, 57], fill=1)

    def _render_combat(self, draw):
        """Sword icon + determined face."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Determined eyes (angled)
        draw.line([35, 20, 50, 24], fill=1, width=2)
        draw.line([78, 24, 93, 20], fill=1, width=2)
        draw.ellipse([38, 24, 48, 32], outline=1, fill=1)
        draw.ellipse([80, 24, 90, 32], outline=1, fill=1)

        # Determined mouth
        draw.line([50, 46, 78, 46], fill=1, width=2)

        # Small sword icon in corner
        draw.line([108, 8, 114, 8], fill=1, width=1)  # crossguard
        draw.line([111, 4, 111, 14], fill=1, width=1)  # blade
        draw.line([111, 14, 111, 18], fill=1, width=2)  # hilt

    def _render_sleeping(self, draw):
        """Closed eyes with Zzz animation."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Closed eyes (horizontal lines, low)
        draw.line([35, 28, 50, 28], fill=1, width=2)
        draw.line([78, 28, 93, 28], fill=1, width=2)

        # Slight smile
        draw.arc([48, 38, 80, 52], start=0, end=180, fill=1, width=1)

        # Animated Zzz
        phase = (self._frame_counter // 8) % 3
        base_x, base_y = 96, 8
        for i in range(phase + 1):
            x = base_x + i * 6
            y = base_y - i * 6
            size = 4 + i
            # Draw a small Z
            draw.line([x, y, x + size, y], fill=1)
            draw.line([x + size, y, x, y + size], fill=1)
            draw.line([x, y + size, x + size, y + size], fill=1)

    def _render_laughing(self, draw):
        """Squinted eyes + bouncing open mouth."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Squinted eyes (tight arcs)
        draw.arc([33, 18, 52, 32], start=200, end=340, fill=1, width=2)
        draw.arc([76, 18, 95, 32], start=200, end=340, fill=1, width=2)

        # Bouncing wide-open mouth
        bounce = (self._frame_counter % 6) - 3
        mouth_y = 38 + abs(bounce)
        draw.ellipse([44, mouth_y, 84, mouth_y + 16], outline=1, fill=0)

    def _render_scared(self, draw):
        """Wide eyes, small mouth, trembling outline."""
        # Trembling outline
        offset = 1 if self._frame_counter % 4 < 2 else -1
        draw.rounded_rectangle([10 + offset, 4, 118 + offset, 60], radius=8, outline=1)

        # Wide scared eyes
        draw.ellipse([30, 12, 54, 36], outline=1, fill=1)
        draw.ellipse([74, 12, 98, 36], outline=1, fill=1)
        # Tiny pupils (high)
        draw.ellipse([39, 16, 45, 22], outline=0, fill=0)
        draw.ellipse([83, 16, 89, 22], outline=0, fill=0)

        # Small O mouth
        draw.ellipse([58, 44, 70, 54], outline=1, fill=0)

    def _render_surprised(self, draw):
        """Giant round eyes, O-mouth."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Giant round eyes
        draw.ellipse([28, 10, 56, 38], outline=1, fill=1)
        draw.ellipse([72, 10, 100, 38], outline=1, fill=1)
        # Large pupils
        draw.ellipse([37, 18, 47, 28], outline=0, fill=0)
        draw.ellipse([81, 18, 91, 28], outline=0, fill=0)

        # Big O mouth
        draw.ellipse([52, 40, 76, 58], outline=1, fill=0)

    def _render_love(self, draw):
        """Heart-shaped eyes."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Heart-shaped eyes (two circles + triangle)
        for cx in [42, 86]:
            # Left bump
            draw.ellipse([cx - 10, 14, cx, 26], fill=1)
            # Right bump
            draw.ellipse([cx, 14, cx + 10, 26], fill=1)
            # Bottom point
            draw.polygon([cx - 10, 22, cx + 10, 22, cx, 34], fill=1)

        # Happy smile
        draw.arc([40, 36, 88, 56], start=0, end=180, fill=1, width=2)

    def _render_confused(self, draw):
        """Asymmetric eyes, question mark."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Left eye: normal
        draw.ellipse([35, 18, 50, 32], outline=1, fill=1)
        draw.ellipse([40, 22, 45, 28], outline=0, fill=0)

        # Right eye: smaller, higher (asymmetric)
        draw.ellipse([82, 22, 93, 32], outline=1, fill=1)
        draw.ellipse([85, 24, 90, 30], outline=0, fill=0)

        # Raised eyebrow on right
        draw.arc([80, 14, 96, 24], start=180, end=360, fill=1, width=1)

        # Squiggly mouth
        draw.arc([48, 42, 60, 52], start=0, end=180, fill=1, width=1)
        draw.arc([60, 42, 72, 52], start=180, end=360, fill=1, width=1)

        # Question mark in corner
        draw.arc([104, 8, 116, 18], start=180, end=0, fill=1, width=1)
        draw.line([110, 18, 110, 22], fill=1)
        draw.point([110, 25], fill=1)

    def _render_singing(self, draw):
        """Musical notes floating upward."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Happy squinted eyes
        draw.arc([33, 18, 52, 32], start=200, end=340, fill=1, width=2)
        draw.arc([76, 18, 95, 32], start=200, end=340, fill=1, width=2)

        # Open singing mouth (oval)
        draw.ellipse([54, 38, 74, 52], outline=1, fill=0)

        # Floating musical notes (animated upward)
        phase = self._frame_counter % 20
        for i, base_x in enumerate([100, 112, 18]):
            y = 40 - (phase + i * 7) % 30
            x = base_x
            # Simple note: dot + stem
            draw.ellipse([x, y, x + 4, y + 3], fill=1)
            draw.line([x + 4, y, x + 4, y - 6], fill=1)

    def _render_shy(self, draw):
        """Downcast eyes, dithered blush circles."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Downcast eyes (looking down)
        draw.ellipse([35, 20, 50, 34], outline=1, fill=1)
        draw.ellipse([78, 20, 93, 34], outline=1, fill=1)
        # Pupils looking down
        draw.ellipse([39, 28, 46, 34], outline=0, fill=0)
        draw.ellipse([82, 28, 89, 34], outline=0, fill=0)

        # Dithered blush circles (checkerboard pattern for pixel art blush)
        for cx, cy in [(30, 40), (98, 40)]:
            for dx in range(-4, 5):
                for dy in range(-3, 4):
                    if (dx + dy) % 2 == 0 and dx * dx + dy * dy <= 16:
                        draw.point([cx + dx, cy + dy], fill=1)

        # Small smile
        draw.arc([50, 40, 78, 52], start=0, end=180, fill=1, width=1)

    def _render_wink(self, draw):
        """One eye closed, slight smile."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Left eye: open
        draw.ellipse([35, 18, 50, 32], outline=1, fill=1)
        draw.ellipse([40, 22, 45, 28], outline=0, fill=0)

        # Right eye: closed (wink) — arc
        draw.arc([78, 22, 93, 30], start=0, end=180, fill=1, width=2)

        # Slight smile (asymmetric — higher on wink side)
        draw.arc([44, 38, 84, 54], start=0, end=180, fill=1, width=2)

    def _render_mischievous(self, draw):
        """Angled brows, narrowed eyes, wide grin."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Angled eyebrows (evil-ish)
        draw.line([32, 20, 52, 16], fill=1, width=1)  # left brow angles up-right
        draw.line([76, 16, 96, 20], fill=1, width=1)  # right brow angles up-left

        # Narrowed eyes
        draw.ellipse([35, 22, 50, 30], outline=1, fill=1)
        draw.ellipse([78, 22, 93, 30], outline=1, fill=1)
        draw.ellipse([40, 24, 45, 29], outline=0, fill=0)
        draw.ellipse([83, 24, 88, 29], outline=0, fill=0)

        # Wide mischievous grin
        draw.arc([34, 34, 94, 58], start=0, end=180, fill=1, width=2)

    def _render_warmup(self, draw):
        """Boot/loading animation with spinning arc and pulsing dots."""
        import math
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Sleepy half-closed eyes
        draw.line([35, 25, 50, 25], fill=1, width=2)
        draw.line([78, 25, 93, 25], fill=1, width=2)

        # Spinning loading arc
        self._warmup_angle += 15
        start = self._warmup_angle % 360
        draw.arc([44, 34, 84, 58], start=start, end=start + 90, fill=1, width=2)

        # Pulsing dots below eyes
        phase = (self._frame_counter % 20) / 20.0
        for i in range(3):
            alpha = (phase + i * 0.33) % 1.0
            if alpha < 0.5:
                x = 52 + i * 12
                draw.ellipse([x, 30, x + 3, 33], fill=1)

    def _render_capturing(self, draw):
        """Camera viewfinder frame when taking a photo."""
        draw.rounded_rectangle([10, 4, 118, 60], radius=8, outline=1)

        # Wide alert eyes
        draw.ellipse([32, 14, 52, 34], outline=1, fill=1)
        draw.ellipse([76, 14, 96, 34], outline=1, fill=1)
        draw.ellipse([38, 20, 46, 28], outline=0, fill=0)
        draw.ellipse([82, 20, 90, 28], outline=0, fill=0)

        # Camera icon in center-bottom
        draw.rectangle([54, 40, 74, 52], outline=1)
        draw.ellipse([60, 42, 68, 50], outline=1)

        # Viewfinder corner brackets (flashing)
        if self._frame_counter % 6 < 3:
            for x1, y1, x2, y2 in [(12, 6, 20, 6), (12, 6, 12, 14),
                                     (116, 6, 108, 6), (116, 6, 116, 14),
                                     (12, 58, 20, 58), (12, 58, 12, 50),
                                     (116, 58, 108, 58), (116, 58, 116, 50)]:
                draw.line([x1, y1, x2, y2], fill=1, width=1)
