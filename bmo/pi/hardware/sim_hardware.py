"""Stub hardware adapters for BMO_SIMULATE=1 (off-Pi development).

Same surface as the real LED/OLED/camera controllers with fake-but-observable
behaviour: every call is logged and pushed to the web UI via a `sim_hardware`
SocketIO event so the LED ring / OLED face / camera can be UX-tested without the
physical hardware. (BMO-SUGGESTIONS 2026-06-22.)
"""
from services.bmo_logging import get_logger

log = get_logger("sim_hw")


class _SimDevice:
    def __init__(self, name, socketio=None, **_):
        self._name = name
        self._socketio = socketio
        self.state = {"device": name, "simulated": True}

    def _push(self, **st):
        self.state.update(st)
        log.info("[sim:%s] %s", self._name, st)
        if self._socketio is not None:
            try:
                self._socketio.emit("sim_hardware", dict(self.state))
            except Exception:
                pass

    def start(self):
        self._push(status="started")

    def stop(self):
        self._push(status="stopped")

    def get_full_state(self):
        return dict(self.state)

    def __getattr__(self, item):
        # Absorb any other method call so stubs never AttributeError in sim mode.
        if item.startswith("__"):
            raise AttributeError(item)

        def _noop(*a, **k):
            self._push(last_call=item)
            return None

        return _noop


class SimLedController(_SimDevice):
    def __init__(self, socketio=None, **kw):
        super().__init__("leds", socketio, **kw)

    def set_color(self, *a, **k):
        self._push(color=list(a) or k)

    def set_color_by_name(self, name, *a, **k):
        self._push(color_name=name)

    def set_brightness(self, v, *a, **k):
        self._push(brightness=v)

    def set_mode(self, m, *a, **k):
        self._push(mode=m)

    def set_state(self, *a, **k):
        self._push(led_state=k or list(a))


class SimOledFace(_SimDevice):
    def __init__(self, socketio=None, **kw):
        super().__init__("oled_face", socketio, **kw)

    def set_expression(self, expr, *a, **k):
        self._push(expression=expr)


class SimCameraService(_SimDevice):
    def __init__(self, socketio=None, **kw):
        super().__init__("camera", socketio, **kw)
