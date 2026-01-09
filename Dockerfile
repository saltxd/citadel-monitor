# Citadel Monitor - Multi-stage Docker Build
# Builds both frontend and backend into a single container

# =============================================================================
# Stage 1: Build Frontend
# =============================================================================
FROM node:18-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better cache utilization
COPY frontend/package*.json ./
RUN npm ci --silent

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# =============================================================================
# Stage 2: Production Image
# =============================================================================
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/*.py ./

# Copy frontend build to static directory
COPY --from=frontend-builder /app/frontend/dist ./static

# Default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3000/health')" || exit 1

# Run uvicorn on port 3000 (standard web port for Docker Compose)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
