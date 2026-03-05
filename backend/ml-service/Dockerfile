# ── ML Microservice ────────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app/ml-service

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ML service source
COPY . .

# Create models directory
RUN mkdir -p models

# Non-root user
RUN useradd -m -u 1001 mluser && chown -R mluser /app
USER mluser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()" || exit 1

# Pre-train models on startup if not present, then start server
CMD ["sh", "-c", "python train_model.py && uvicorn main:app --host 0.0.0.0 --port 8000"]
