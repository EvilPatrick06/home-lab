# syntax=docker/dockerfile:1
FROM python:3.14-slim-bookworm@sha256:86f975aca15cf04a40b399eebede9aea7c82eae084d1f1a0a6ef6bcaae871a30
ARG REQUIREMENTS=requirements.txt        # CI overrides with requirements-ci.txt
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential portaudio19-dev libsndfile1 ffmpeg vlc curl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pi/requirements*.txt ./
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r "$REQUIREMENTS" \
 && pip install --no-cache-dir --no-deps openwakeword==0.6.0
COPY pi/ /app/
ENV PYTHONUNBUFFERED=1
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:5000/health || exit 1
CMD ["python", "app.py"]
