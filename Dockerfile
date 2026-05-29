FROM python:3.11-slim

WORKDIR /app

# System deps: ffmpeg + build tools for bcrypt/pycryptodome
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Step 1: Install PyTorch CPU-only FIRST (slim ~200MB vs GPU ~2GB) ─────────
# This must come before openai-whisper so it doesn't pull the GPU version
RUN pip install --no-cache-dir \
    torch==2.2.2 \
    torchaudio==2.2.2 \
    --index-url https://download.pytorch.org/whl/cpu

# ── Step 2: Install all other dependencies ────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Step 3: Copy backend source ───────────────────────────────────────────────
COPY backend/ ./backend/

# Writable dir for user data (users.json, audit log)
RUN mkdir -p /data && chmod 777 /data
ENV VELORA_DATA_DIR=/data

EXPOSE 8000

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
