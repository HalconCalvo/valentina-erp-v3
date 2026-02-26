FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# INSTALAMOS TODO LO NECESARIO:
# gcc, libpq-dev: para base de datos
# libjpeg-dev, zlib1g-dev: para Pillow (imágenes)
# libffi-dev: para criptografía
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libjpeg-dev \
    zlib1g-dev \
    libffi-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Usamos puerto 8080 explícito
ENV PORT=8080

# Usamos GUNICORN como gestor de procesos
CMD exec gunicorn app.main:app \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --threads 8 \
    --timeout 0 \
    --bind 0.0.0.0:8080