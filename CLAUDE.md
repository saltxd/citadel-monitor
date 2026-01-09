# Citadel Monitor - Development Guide

## Project Overview

Terminal-styled infrastructure monitoring dashboard. Public repo with private homelab configs separated.

## Repository Structure

```
situation-monitor/
├── backend/           # FastAPI + WebSocket server
├── frontend/          # React + Tailwind
├── k8s/               # PUBLIC K8s manifests (generic examples)
├── k8s-private/       # GITIGNORED - Real homelab configs
├── config.yaml        # GITIGNORED - Local dev config
└── config.example.yaml # Template for users
```

## Development Workflow

### Making Changes

```bash
# 1. Edit code
# 2. Test locally if needed
# 3. Commit and push
git add -A && git commit -m "Description" && git push

# 4. Wait for GHCR build
gh run watch

# 5. Deploy to K3s
kubectl rollout restart deployment/citadel-monitor -n situation-monitor
```

### Local Development

```bash
# Backend (port 8000)
cd backend && source venv/bin/activate
uvicorn main:app --reload --port 8000

# Frontend (port 5173, proxies to backend)
cd frontend && npm run dev
```

## Key Files

| File | Purpose |
|------|---------|
| `backend/config.py` | Pydantic config models |
| `backend/main.py` | FastAPI app, all endpoints |
| `frontend/src/App.tsx` | Main React component, conditional rendering |
| `config.example.yaml` | Public template |
| `k8s-private/configmap.yaml` | Real homelab config (gitignored) |

## Configuration

Config is loaded from `config.yaml` (local) or ConfigMap (K8s). Features are toggled:

- `prometheus.enabled` - Infrastructure metrics, alerts
- `kubernetes.enabled` - Cluster overview, activity timeline
- `firewall.enabled` - FortiGate network topology

Frontend fetches `/api/config` and conditionally renders panels.

## IMPORTANT: Privacy

**NEVER commit to the public repo:**
- Real IP addresses (192.168.1.x with your actual hosts)
- Real hostnames (*.k3s.nox, *.homelab.internal)
- API tokens or secrets
- The `k8s-private/` directory contents

**Safe for public:**
- Example IPs (10.0.0.x, 192.168.1.x as placeholders)
- Generic hostnames (example.com, monitor.example.com)
- `config.example.yaml` with placeholder values

## Deployment

### Docker Compose (for users)
```bash
docker-compose up -d
```

### K8s (your homelab)
```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s-private/configmap.yaml    # Your real config
kubectl apply -f k8s-private/fortigate-secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s-private/ingressroute.yaml  # Your hostname
```

## Image

- **Registry**: ghcr.io/saltxd/citadel-monitor
- **Auto-built**: On push to main via GitHub Actions
- **Multi-arch**: linux/amd64, linux/arm64

## Links

- **Repo**: https://github.com/saltxd/citadel-monitor
- **Dashboard**: http://monitor.k3s.nox
- **BookStack Docs**: http://docs.k3s.nox/books/services/page/citadel-monitor
