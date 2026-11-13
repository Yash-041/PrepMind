# PrepMind backend (FastAPI). Built from the PrepMind folder so the code keeps its
# `backend.` package path:   docker compose build backend
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# Code only: secrets come from env_file and the PDFs/cache from a mounted volume.
COPY backend backend

EXPOSE 8000

# One worker: exam papers are prepared in background threads tracked in this process.
CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000"]
