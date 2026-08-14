# syntax=docker/dockerfile:1
FROM python:3.14-slim-bookworm@sha256:23c59390fc717bf09f9336908199a0ae75d9c4264bf296123f94ad772fea3b52
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
