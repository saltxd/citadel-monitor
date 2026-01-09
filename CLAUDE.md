# Citadel Monitor - Development Guide

## Overview

Terminal-styled infrastructure monitoring dashboard. Configurable via YAML, deploys via Docker Compose or Kubernetes.

## Development Workflow

```bash
# 1. Make changes locally
# 2. Commit and push (triggers GHCR build)
git add -A && git commit -m "Description" && git push

# 3. Wait for build (~2 min)
gh run watch

# 4. Deploy - image auto-pulls from GHCR
# Docker: docker-compose pull && docker-compose up -d
# K8s: kubectl rollout restart deployment/citadel-monitor -n situation-monitor
```

## Repository Structure

```
situation-monitor/
├── backend/              # FastAPI + WebSocket
│   ├── config.py         # Pydantic config models
│   └── main.py           # API endpoints, WebSocket
├── frontend/             # React + Tailwind
│   └── src/App.tsx       # Conditional panel rendering
├── k8s/                  # Generic K8s manifests
├── config.example.yaml   # Configuration template
├── Dockerfile            # Multi-stage unified build
└── docker-compose.yml    # Docker deployment
```

## Configuration

See `config.example.yaml` for all options. Key features:

- `services` - HTTP health checks (always shown)
- `prometheus.enabled` - Infrastructure metrics, alerts
- `kubernetes.enabled` - Cluster overview, activity timeline
- `firewall.enabled` - Network topology (FortiGate)

Frontend fetches `/api/config` and conditionally renders panels.

## For Contributors

- Use example/placeholder values in commits (10.0.0.x, example.com)
- Test with `docker-compose up` before pushing
- Multi-arch build: linux/amd64, linux/arm64
