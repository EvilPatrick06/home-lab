"""BMO Camera Service — Cloud vision with local fallback.

Routes object detection to Google Cloud Vision API and scene descriptions
to Gemini cloud API. Falls back to local YOLOv8-Nano and Ollama.
"""

import json
import os
import pickle
import threading
import time

import cv2
import numpy as np
import requests

from services.cloud_providers import google_vision_detect

DATA_DIR = os.path.expanduser("~/home-lab/bmo/pi/data")
KNOWN_FACES_JSON = os.path.join(DATA_DIR, "known_faces.json")
KNOWN_FACES_PATH = os.path.join(DATA_DIR, "known_faces.pkl")  # legacy — migrated on read
SNAPSHOTS_DIR = os.path.join(DATA_DIR, "snapshots")


def _check_cloud() -> bool:
    """Quick check if cloud APIs are reachable."""
    try:
        from agent import _check_cloud_available
        return _check_cloud_available()
    except ImportError:
        try:
            requests.get("https://generativelanguage.googleapis.com/", timeout=3)
            return True
        except Exception:
            return False


class CameraService:
    """Manages the Pi camera for streaming, face recognition, object detection, and OCR."""

    def __init__(self, socketio=None):
        self.socketio = socketio
        self._camera = None
        self._backend = None
        self._yolo = None
        self._ocr_reader = None
        self._known_faces: dict = {}
        self._known_faces_loaded = False
        self._motion_enabled = False
        self._motion_thread = None
        self._prev_frame = None
        self._lock = threading.Lock()
        # Thread-based frame capture for gevent compatibility
        self._latest_frame = None
        self._frame_event = threading.Event()
        self._capture_thread = None
        self._capture_running = False

        os.makedirs(SNAPSHOTS_DIR, exist_ok=True)

        # Start camera eagerly so stream is ready immediately
        try:
            self.start()
        except Exception as e:
            print(f"[camera] Init failed: {e}")

    # ── Camera Lifecycle ─────────────────────────────────────────────

    def start(self):
        """Initialize the camera (picamera2 preferred, OpenCV USB fallback)."""
        if self._camera is not None:
            return

        # Check if a Pi Camera (CSI) is actually connected before trying picamera2
        _has_pi_camera = False
        try:
            import subprocess
            result = subprocess.run(
                ["rpicam-hello", "--list-cameras"],
                capture_output=True, text=True, timeout=5,
            )
            _has_pi_camera = "No cameras" not in result.stdout
        except Exception:
            pass

        if _has_pi_camera:
            try:
                from picamera2 import Picamera2

                cam = Picamera2()
                config = cam.create_still_configuration(
                    main={"size": (1920, 1080), "format": "RGB888"},
                    lores={"size": (640, 480), "format": "RGB888"},
                )
                cam.configure(config)
                cam.start()
                time.sleep(1)
                self._camera = cam
                self._backend = "picamera2"
                print("[camera] Using Pi Camera (picamera2)")
                self._start_capture_thread()
                return
            except (ImportError, RuntimeError) as e:
                print(f"[camera] picamera2 failed ({e}), trying USB fallback")
        else:
            print("[camera] No Pi Camera detected, using USB webcam")

        # Fallback to OpenCV USB webcam (Elgato Facecam 4K)
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            raise RuntimeError("No camera available: picamera2 failed and no USB webcam found")
        # Elgato Facecam 4K via USB2: 1080p MJPG, 16:9 aspect
        cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
        cap.set(cv2.CAP_PROP_FPS, 30)
        self._camera = cap
        self._backend = "opencv"
        print("[camera] Using Elgato Facecam 4K (USB2, 1920x1080 MJPG)")
        self._start_capture_thread()

    def _start_capture_thread(self):
        """Start background thread that continuously captures frames."""
        if self._capture_thread and self._capture_running:
            return
        self._capture_running = True
        self._capture_thread = threading.Thread(
            target=self._capture_loop, daemon=True, name="camera-capture"
        )
        self._capture_thread.start()

    def _capture_loop(self):
        """Background loop: reads frames from camera, stores latest."""
        while self._capture_running and self._camera is not None:
            try:
                if self._backend == "opencv":
                    ok, frame = self._camera.read()
                    if ok:
                        self._latest_frame = frame
                        self._frame_event.set()
                else:
                    frame_rgb = self._camera.capture_array("lores")
                    self._latest_frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
                    self._frame_event.set()
            except Exception:
                pass
            time.sleep(0.033)  # ~30 FPS capture rate

    def stop(self):
        """Stop the camera."""
        self._capture_running = False
        self.stop_motion_detection()
        if self._camera:
            if self._backend == "opencv":
                self._camera.release()
            else:
                self._camera.stop()
            self._camera = None
            self._backend = None

    def capture_frame(self) -> np.ndarray:
        """Capture a single frame from the camera. Returns BGR numpy array."""
        # Use buffered frame from capture thread if available
        if self._latest_frame is not None:
            return self._latest_frame.copy()
        if self._camera is None:
            self.start()
        if self._backend == "opencv":
            success, frame = self._camera.read()
            if not success:
                raise RuntimeError("Failed to capture frame from USB webcam")
            return frame
        frame_rgb = self._camera.capture_array("lores")
        return cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)

    def capture_full_res(self) -> np.ndarray:
        """Capture a full-resolution frame."""
        if self._camera is None:
            self.start()
        if self._backend == "opencv":
            # For OpenCV, read directly for freshest full-res frame
            with self._lock:
                success, frame = self._camera.read()
            if not success:
                raise RuntimeError("Failed to capture frame from USB webcam")
            return frame
        frame_rgb = self._camera.capture_array("main")
        return cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)

    # ── MJPEG Stream ─────────────────────────────────────────────────

    def generate_mjpeg(self):
        """Generator that yields MJPEG frames for Flask streaming response."""
        while True:
            if self._latest_frame is not None:
                _, jpeg = cv2.imencode(
                    ".jpg", self._latest_frame,
                    [cv2.IMWRITE_JPEG_QUALITY, 80],
                )
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg.tobytes() + b"\r\n"
                )
            time.sleep(0.067)  # ~15 FPS

    # ── Snapshots ────────────────────────────────────────────────────

    def take_snapshot(self) -> str:
        """Capture a full-res photo and save it. Returns the file path."""
        frame = self.capture_full_res()
        filename = f"snapshot_{int(time.time())}.jpg"
        path = os.path.join(SNAPSHOTS_DIR, filename)
        cv2.imwrite(path, frame)
        return path

    # ── Face Recognition ─────────────────────────────────────────────

    def _load_known_faces(self):
        if self._known_faces_loaded:
            return self._known_faces
        self._known_faces_loaded = True
        if os.path.exists(KNOWN_FACES_JSON):
            with open(KNOWN_FACES_JSON, encoding="utf-8") as f:
                raw = json.load(f)
            self._known_faces = {
                name: [np.array(enc, dtype=np.float64) for enc in encs]
                for name, encs in raw.items()
            }
        elif os.path.exists(KNOWN_FACES_PATH):
            with open(KNOWN_FACES_PATH, "rb") as f:
                self._known_faces = pickle.load(f)
            self._save_known_faces_json()
            try:
                os.remove(KNOWN_FACES_PATH)
            except OSError:
                pass
        return self._known_faces

    def _save_known_faces_json(self):
        os.makedirs(os.path.dirname(KNOWN_FACES_JSON), exist_ok=True)
        serializable = {
            name: [enc.tolist() for enc in encs]
            for name, encs in self._known_faces.items()
        }
        with open(KNOWN_FACES_JSON, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2)

    def identify_faces(self, frame: np.ndarray = None) -> list[dict]:
        """Detect and identify faces in a frame. Returns list of {name, location}."""
        import face_recognition

        if frame is None:
            frame = self.capture_frame()

        known = self._load_known_faces()

        # Downscale for speed
        small = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
        rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)

        locations = face_recognition.face_locations(rgb_small, model="hog")
        encodings = face_recognition.face_encodings(rgb_small, locations)

        results = []
        for encoding, location in zip(encodings, locations):
            name = "unknown"
            for known_name, known_encs in known.items():
                matches = face_recognition.compare_faces(known_encs, encoding, tolerance=0.5)
                if any(matches):
                    name = known_name
                    break

            # Scale location back to original size
            top, right, bottom, left = [v * 4 for v in location]
            results.append({"name": name, "location": {"top": top, "right": right, "bottom": bottom, "left": left}})

        return results

    def enroll_face(self, name: str, image_paths: list[str]):
        """Register a person's face from multiple photos."""
        import face_recognition

        encodings = []
        for path in image_paths:
            img = face_recognition.load_image_file(path)
            encs = face_recognition.face_encodings(img)
            if encs:
                encodings.append(encs[0])

        if not encodings:
            raise ValueError("No faces detected in provided images")

        known = self._load_known_faces()
        known[name] = encodings
        self._known_faces = known
        self._save_known_faces_json()

        print(f"[face] Enrolled '{name}' with {len(encodings)} face encodings")

    # ── Object Detection (Google Cloud Vision → local YOLOv8-Nano) ──

    def _load_yolo(self):
        if self._yolo is None:
            try:
                from ultralytics import YOLO
                self._yolo = YOLO("yolov8n.pt")
            except ImportError:
                print("[vision] ultralytics not installed, YOLO detection unavailable")
                return None
        return self._yolo

    def detect_objects(self, frame: np.ndarray = None) -> list[dict]:
        """Detect objects in a frame. Routes to Google Cloud Vision with local fallback."""
        if frame is None:
            frame = self.capture_frame()

        if _check_cloud():
            try:
                return self._cloud_detect_objects(frame)
            except Exception as e:
                print(f"[vision] Cloud detection failed ({e}), falling back to local")

        return self._local_detect_objects(frame)

    def _cloud_detect_objects(self, frame: np.ndarray) -> list[dict]:
        """Send frame to Google Cloud Vision API for object detection."""
        _, jpeg = cv2.imencode(".jpg", frame)
        result = google_vision_detect(jpeg.tobytes())
        detections = []
        for obj in result.get("localizedObjectAnnotations", []):
            verts = obj.get("boundingPoly", {}).get("normalizedVertices", [])
            h, w = frame.shape[:2]
            if len(verts) >= 4:
                x1, y1 = int(verts[0].get("x", 0) * w), int(verts[0].get("y", 0) * h)
                x2, y2 = int(verts[2].get("x", 0) * w), int(verts[2].get("y", 0) * h)
            else:
                x1 = y1 = x2 = y2 = 0
            detections.append({
                "class": obj.get("name", "unknown"),
                "confidence": round(obj.get("score", 0), 2),
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
            })
        return detections

    def _local_detect_objects(self, frame: np.ndarray) -> list[dict]:
        """Detect with local YOLOv8-Nano (fallback, lower accuracy)."""
        model = self._load_yolo()
        if model is None:
            return []
        results = model(frame, verbose=False)

        detections = []
        for r in results:
            for box in r.boxes:
                cls = model.names[int(box.cls)]
                conf = float(box.conf)
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append({
                    "class": cls,
                    "confidence": round(conf, 2),
                    "bbox": {"x1": int(x1), "y1": int(y1), "x2": int(x2), "y2": int(y2)},
                })

        return detections

    # ── OCR ──────────────────────────────────────────────────────────

    def _load_ocr(self):
        if self._ocr_reader is None:
            import easyocr
            self._ocr_reader = easyocr.Reader(["en"], gpu=False)
        return self._ocr_reader

    def read_text(self, frame: np.ndarray = None) -> str:
        """Read text from a camera frame using OCR."""
        if frame is None:
            frame = self.capture_frame()

        reader = self._load_ocr()
        results = reader.readtext(frame)
        return " ".join(r[1] for r in results)

    # ── Vision Description (Cloud LLM → local Ollama → detection fallback) ──

    def describe_scene(self, prompt: str = "What do you see?") -> str:
        """Describe what the camera sees using Gemini vision API."""
        frame = self.capture_frame()
        _, jpeg = cv2.imencode(".jpg", frame)
        return self._gemini_describe(jpeg.tobytes(), prompt)

    def _gemini_describe(self, image_bytes: bytes, prompt: str) -> str:
        """Send image to Gemini API for scene description."""
        import base64
        import requests as req
        from services.cloud_providers import GEMINI_API_KEY, GEMINI_BASE

        if not GEMINI_API_KEY:
            raise RuntimeError("Gemini vision failed — no API key configured")

        b64 = base64.b64encode(image_bytes).decode("utf-8")
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/jpeg", "data": b64}},
                ],
            }],
            "generationConfig": {"temperature": 0.4, "maxOutputTokens": 1024},
        }
        url = f"{GEMINI_BASE}/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
        r = req.post(url, json=payload, timeout=30)
        r.raise_for_status()
        data = r.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        return "No description available"

    def _detection_fallback(self, frame: np.ndarray) -> str:
        """Build a text description from object detection + face recognition."""
        objects = self.detect_objects(frame)
        faces = self.identify_faces(frame)
        parts = []
        if faces:
            names = [f["name"] for f in faces]
            parts.append(f"I see: {', '.join(names)}")
        if objects:
            obj_summary = {}
            for obj in objects:
                obj_summary[obj["class"]] = obj_summary.get(obj["class"], 0) + 1
            obj_strs = [f"{count} {cls}" if count > 1 else cls for cls, count in obj_summary.items()]
            parts.append(f"Objects: {', '.join(obj_strs)}")
        return " | ".join(parts) if parts else "BMO's eyes are fuzzy right now"

    # ── Motion Detection ─────────────────────────────────────────────

    def start_motion_detection(self, threshold: float = 25.0, min_area: int = 5000):
        """Start background motion detection. Emits 'motion_detected' events."""
        if self._motion_enabled:
            return
        self._motion_enabled = True
        self._motion_thread = threading.Thread(
            target=self._motion_loop, args=(threshold, min_area), daemon=True
        )
        self._motion_thread.start()

    def stop_motion_detection(self):
        """Stop motion detection."""
        self._motion_enabled = False

    def _motion_loop(self, threshold: float, min_area: int):
        """Background loop that compares frames for motion."""
        self._prev_frame = None

        while self._motion_enabled:
            frame = self.capture_frame()
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (21, 21), 0)

            if self._prev_frame is None:
                self._prev_frame = gray
                time.sleep(1)
                continue

            delta = cv2.absdiff(self._prev_frame, gray)
            thresh = cv2.threshold(delta, threshold, 255, cv2.THRESH_BINARY)[1]
            thresh = cv2.dilate(thresh, None, iterations=2)

            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            motion_detected = any(cv2.contourArea(c) > min_area for c in contours)

            if motion_detected:
                # Try to identify what triggered the motion
                objects = self.detect_objects(frame)
                description = ", ".join(set(o["class"] for o in objects[:5])) or "movement"
                self._emit("motion_detected", {"description": description, "timestamp": time.time()})

                # Cooldown to avoid spam
                time.sleep(10)

            self._prev_frame = gray
            time.sleep(2)  # Check every 2 seconds

    # ── Helpers ──────────────────────────────────────────────────────

    def _emit(self, event: str, data: dict):
        if self.socketio:
            self.socketio.emit(event, data)
