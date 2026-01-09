# Citadel Monitor

A beautiful, terminal-styled infrastructure monitoring dashboard.
<img width="1716" height="1040" alt="Screenshot 2026-01-09 at 7 43 02 AM" src="https://github.com/user-attachments/assets/b2164170-da96-4c1b-9a77-1ceaefd7586e" />

![IMG_2230](https://github.com/user-attachments/assets/ec684f9d-1b37-4434-823c-a6b6ff84af38)

![Dashboard Theme](https://img.shields.io/badge/theme-terminal%20green-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Features

- **Real-time service health monitoring** - HTTP health checks with response times
- **Infrastructure metrics** - CPU, RAM, disk via Prometheus
- **Kubernetes cluster overview** - Pod counts, node status, live events
- **Firewall integration** - FortiGate status, interface bandwidth, DHCP/ARP stats
- **Terminal aesthetic** - Beautiful green-on-black retro theme

## Quick Start

```bash
git clone https://github.com/saltxd/citadel-monitor
cd citadel-monitor
cp config.example.yaml config.yaml
# Edit config.yaml with your services
docker-compose up -d
```

Visit http://localhost:3000

## Configuration

Edit `config.yaml` to customize your dashboard:

### Minimal Setup (Services Only)

```yaml
dashboard:
  title: "MY MONITOR"

services:
  - name: "My App"
    url: "http://localhost:8080"
  - name: "API Server"
    url: "https://api.example.com"
    healthPath: "/health"
```

### Full Setup (All Integrations)

```yaml
dashboard:
  title: "HOMELAB MONITOR"
  version: "v1.0.0"

services:
  - name: "Plex"
    url: "http://plex:32400/web"
  - name: "Home Assistant"
    url: "http://homeassistant:8123"
  - name: "Grafana"
    url: "http://192.168.1.100"
    host: "grafana.home.lan"  # Host header for Traefik routing

prometheus:
  enabled: true
  url: "http://prometheus:9090"
  nodes:
    - name: "server-1"
      host: "192.168.1.10:9100"
    - name: "server-2"
      host: "192.168.1.11:9100"

kubernetes:
  enabled: true
  # Uses in-cluster config in K8s, or ~/.kube/config locally

firewall:
  enabled: true
  type: "fortigate"
  host: "https://192.168.1.1"
  tokenEnvVar: "FORTIGATE_TOKEN"
  verifySsl: false
```

### Feature Toggles

The dashboard automatically hides panels for disabled features:

| Feature | Panels Shown |
|---------|-------------|
| `services` only | Service Health |
| `prometheus: enabled` | Infrastructure Map, Metrics Panel, Alert Feed |
| `kubernetes: enabled` | Cluster Overview (in Infra Map), Activity Timeline |
| `firewall: enabled` | Network Topology |

## Deployment Options

### Docker Compose (Recommended)

```bash
# Basic deployment
docker-compose up -d

# Full stack with Prometheus
docker-compose -f docker-compose.full.yml up -d
```

### Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/fortigate-secret.yaml  # Create your own
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/ingressroute.yaml

# Or use kustomize
kubectl apply -k k8s/
```

### Build Locally

```bash
# Build the Docker image
docker build -t citadel-monitor:local .

# Run locally
docker run -p 3000:3000 -v ./config.yaml:/app/config.yaml citadel-monitor:local
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Citadel Monitor                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Frontend (React + Tailwind)       │  Backend (FastAPI + WebSocket)     │
│  - Terminal-themed UI              │  - REST API endpoints              │
│  - Real-time WebSocket updates     │  - 5-second polling interval       │
│  - Responsive grid layout          │  - Async data aggregation          │
│  - Conditional panel rendering     │  - YAML configuration              │
└────────────────────────────────────┴────────────────────────────────────┘
                                           │
          ┌────────────────────────────────┼────────────────────────────────┐
          │                    │           │           │                    │
          ▼                    ▼           ▼           ▼                    ▼
   ┌─────────────┐     ┌─────────────┐ ┌────────┐ ┌──────────┐     ┌───────────┐
   │ Prometheus  │     │ Kubernetes  │ │Services│ │ FortiGate│     │AlertManager│
   │(node_export)│     │     API     │ │  HTTP  │ │ REST API │     │  Alerts   │
   │  Optional   │     │  Optional   │ │ Always │ │ Optional │     │  Optional │
   └─────────────┘     └─────────────┘ └────────┘ └──────────┘     └───────────┘
```

## API Reference

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with component status |
| `GET /api/config` | Public configuration (feature flags) |
| `GET /api/dashboard` | Complete dashboard data |
| `GET /api/services` | Service health only |
| `GET /api/nodes` | Node metrics (Prometheus) |
| `GET /api/alerts` | Active alerts (Prometheus) |
| `GET /api/network` | Network status (FortiGate) |
| `WS /ws` | WebSocket for real-time updates |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CONFIG_FILE` | Path to config.yaml | Auto-detected |
| `FORTIGATE_TOKEN` | FortiGate API token | (empty) |

## Development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Create a minimal config
cat > ../config.yaml << 'EOF'
services:
  - name: "Test"
    url: "http://localhost:8080"
EOF

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
citadel-monitor/
├── .github/workflows/
│   └── build.yml              # GHCR publishing
├── backend/
│   ├── main.py                # FastAPI application
│   ├── config.py              # Configuration loader
│   ├── requirements.txt
│   └── Dockerfile             # Standalone backend build
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main component
│   │   ├── types.ts           # TypeScript interfaces
│   │   └── components/        # Panel components
│   ├── Dockerfile             # Standalone frontend build
│   └── nginx.conf
├── k8s/
│   ├── namespace.yaml
│   ├── rbac.yaml
│   ├── configmap.yaml         # Configuration as ConfigMap
│   ├── deployment.yaml        # Unified deployment
│   └── ingressroute.yaml      # Traefik ingress
├── config.example.yaml        # Configuration template
├── config.yaml                # Your config (gitignored)
├── docker-compose.yml         # Simple deployment
├── docker-compose.full.yml    # With Prometheus stack
├── prometheus.yml             # Prometheus config template
├── Dockerfile                 # Unified multi-stage build
└── README.md
```

## FortiGate Setup

1. Create a REST API admin user in FortiGate
2. Generate an API key with read permissions
3. Set the environment variable:

```bash
# Docker Compose
export FORTIGATE_TOKEN=your-api-key
docker-compose up -d

# Kubernetes
kubectl create secret generic fortigate-api \
  --from-literal=api-key=your-api-key \
  -n situation-monitor
```

## Troubleshooting

**Services showing "DOWN" incorrectly**
- Check if service requires Host header (for Traefik/nginx routing)
- Verify SSL certificates if using HTTPS
- Check for auth redirects blocking health checks

**Nodes showing "N/A" for metrics**
- Verify node_exporter is running on target hosts
- Check Prometheus is scraping: `up{job="node-exporter"}`
- Confirm host:port in config matches scrape target

**FortiGate showing "OFFLINE"**
- Verify API token has read permissions
- Check FortiGate is reachable from container network
- Try `verifySsl: false` for self-signed certs

## Support

If you find Citadel Monitor useful, consider buying me a coffee:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/saltxd)

## License

MIT
