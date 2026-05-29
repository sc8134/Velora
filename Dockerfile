FROM python:3.11-slim

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    g++ \
    libffi-dev \
    libssl-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip + setuptools + wheel
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install openai-whisper FIRST with --no-build-isolation
# (avoids the pkg_resources missing error in pip's isolated build sandbox)
RUN pip install --no-cache-dir --no-build-isolation openai-whisper==20231117

# Install PyTorch CPU-only AFTER whisper
RUN pip install --no-cache-dir \
    torch==2.2.2 \
    torchaudio==2.2.2 \
    --index-url https://download.pytorch.org/whl/cpu

# Install remaining dependencies
COPY requirements.txt .
RUN grep -v "openai-whisper" requirements.txt > requirements_filtered.txt \
    && pip install --no-cache-dir -r requirements_filtered.txt

# Copy backend source
COPY backend/ ./backend/

RUN mkdir -p /data && chmod 777 /data
ENV VELORA_DATA_DIR=/data

EXPOSE 8000

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
