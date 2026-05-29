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

# Upgrade pip + setuptools
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Install all dependencies (faster-whisper is a pre-built wheel — no compilation)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

RUN mkdir -p /data && chmod 777 /data
ENV VELORA_DATA_DIR=/data
ENV PYTHONPATH=/app/backend

EXPOSE 8000

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
