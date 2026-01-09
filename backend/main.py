"""
Citadel Situation Monitor - Backend API

FastAPI backend for real-time homelab monitoring dashboard.
Aggregates data from Prometheus, Kubernetes API, and performs health checks.

Configuration is loaded from config.yaml - see config.example.yaml for options.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import aiohttp
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import config

# Conditional imports for optional integrations
prom = None
if config.prometheus.enabled:
    try:
        from prometheus_api_client import PrometheusConnect
    except ImportError:
        PrometheusConnect = None  # type: ignore

K8S_AVAILABLE = False
k8s_core_v1: Optional[Any] = None
if config.kubernetes.enabled:
    try:
        from kubernetes import client, config as k8s_config
        from kubernetes.client.rest import ApiException
        K8S_AVAILABLE = True
    except ImportError:
        pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =============================================================================
# Initialize Clients Based on Configuration
# =============================================================================

# Prometheus client
if config.prometheus.enabled:
    try:
        if PrometheusConnect:
            prom = PrometheusConnect(url=config.prometheus.url, disable_ssl=True)
            logger.info(f"Prometheus client initialized: {config.prometheus.url}")
    except Exception as e:
        logger.warning(f"Failed to initialize Prometheus client: {e}")

# Kubernetes client
if config.kubernetes.enabled and K8S_AVAILABLE:
    try:
        if config.kubernetes.kubeconfig:
            k8s_config.load_kube_config(config_file=config.kubernetes.kubeconfig)
            logger.info(f"Loaded kubeconfig from {config.kubernetes.kubeconfig}")
        else:
            try:
                k8s_config.load_incluster_config()
                logger.info("Loaded in-cluster Kubernetes config")
            except k8s_config.ConfigException:
                k8s_config.load_kube_config()
                logger.info("Loaded kubeconfig from ~/.kube/config")
    except Exception as e:
        logger.warning(f"Failed to load Kubernetes config: {e}")

    try:
        k8s_core_v1 = client.CoreV1Api()
    except Exception as e:
        logger.warning(f"Failed to initialize Kubernetes client: {e}")

# Get firewall API token from environment if configured
FORTIGATE_API_KEY = ""
if config.firewall.enabled and config.firewall.token_env_var:
    FORTIGATE_API_KEY = os.environ.get(config.firewall.token_env_var, "")

# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(
    title=config.dashboard.title,
    description="Real-time infrastructure monitoring API",
    version=config.dashboard.version,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# WebSocket Connection Manager
# =============================================================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)

        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()

# Storage for bandwidth rate calculation
_previous_interface_stats: Dict[str, Dict[str, Any]] = {}
_last_interface_poll: Optional[datetime] = None

# =============================================================================
# Helper Functions
# =============================================================================

def categorize_alert(alertname: str) -> str:
    """Categorize alerts by keywords in name."""
    alertname_lower = alertname.lower()

    if any(kw in alertname_lower for kw in ["cpu", "memory", "ram", "disk", "filesystem", "storage"]):
        return "resources"
    elif any(kw in alertname_lower for kw in ["pod", "container", "deployment", "replica", "kube", "kubernetes"]):
        return "kubernetes"
    elif any(kw in alertname_lower for kw in ["node", "host", "server", "instance", "machine"]):
        return "infrastructure"
    elif any(kw in alertname_lower for kw in ["network", "connection", "dns", "http", "tcp", "latency"]):
        return "network"
    else:
        return "general"


def format_time_ago(delta: timedelta) -> str:
    """Format timedelta as '5s', '5m', '2h', '1d'."""
    total_seconds = int(delta.total_seconds())

    if total_seconds < 0:
        return "0s"
    elif total_seconds < 60:
        return f"{total_seconds}s"
    elif total_seconds < 3600:
        return f"{total_seconds // 60}m"
    elif total_seconds < 86400:
        return f"{total_seconds // 3600}h"
    else:
        return f"{total_seconds // 86400}d"


def format_uptime(seconds: int) -> str:
    """Format uptime seconds as human readable (e.g., '45d 12h' or '12h 34m')."""
    if seconds <= 0:
        return "Unknown"

    days = seconds // 86400
    hours = (seconds % 86400) // 3600
    minutes = (seconds % 3600) // 60

    if days > 0:
        return f"{days}d {hours}h"
    elif hours > 0:
        return f"{hours}h {minutes}m"
    else:
        return f"{minutes}m"


def parse_prometheus_time(time_str: str) -> Optional[datetime]:
    """Parse Prometheus timestamp to datetime."""
    try:
        if isinstance(time_str, (int, float)):
            return datetime.fromtimestamp(time_str, tz=timezone.utc)
        return datetime.fromisoformat(time_str.replace("Z", "+00:00"))
    except Exception:
        return None


# =============================================================================
# Data Aggregation Functions
# =============================================================================

async def get_node_metrics() -> List[Dict[str, Any]]:
    """
    Get metrics for configured nodes from Prometheus.

    For each node:
    - CPU usage: 100 - (avg idle CPU over 5m)
    - RAM usage: (1 - MemAvailable/MemTotal) * 100
    - Disk usage: (1 - avail/total) * 100 for root filesystem
    - K8s node status: Ready/NotReady from K8s API (if enabled)
    - Health: "healthy" if CPU<80, RAM<85, status=Ready, else "warning"/"error"
    """
    if not config.prometheus.enabled or not config.prometheus.nodes:
        return []

    nodes = []

    # Get K8s node statuses if enabled
    k8s_node_status = {}
    if config.kubernetes.enabled and k8s_core_v1:
        try:
            k8s_nodes = k8s_core_v1.list_node()
            for node in k8s_nodes.items:
                name = node.metadata.name
                ready = "NotReady"
                for condition in node.status.conditions or []:
                    if condition.type == "Ready":
                        ready = "Ready" if condition.status == "True" else "NotReady"
                        break
                k8s_node_status[name] = ready
        except Exception as e:
            logger.warning(f"Failed to get K8s node status: {e}")

    for node_config in config.prometheus.nodes:
        node_name = node_config.name
        node_host = node_config.host
        # Extract IP from host (format: IP:port)
        node_ip = node_host.split(":")[0] if ":" in node_host else node_host

        # Use None to indicate no data available
        cpu_usage: Optional[float] = None
        ram_usage: Optional[float] = None
        disk_usage: Optional[float] = None
        status = k8s_node_status.get(node_name, "Unknown")

        if prom:
            try:
                # CPU usage: 100 - avg idle over 5m
                cpu_query = f'100 - (avg by (instance) (rate(node_cpu_seconds_total{{mode="idle", instance=~"{node_ip}:.*"}}[5m])) * 100)'
                cpu_result = prom.custom_query(cpu_query)
                if cpu_result:
                    cpu_usage = float(cpu_result[0]["value"][1])
            except Exception as e:
                logger.debug(f"CPU query failed for {node_name}: {e}")

            try:
                # RAM usage: (1 - available/total) * 100
                ram_query = f'(1 - (node_memory_MemAvailable_bytes{{instance=~"{node_ip}:.*"}} / node_memory_MemTotal_bytes{{instance=~"{node_ip}:.*"}})) * 100'
                ram_result = prom.custom_query(ram_query)
                if ram_result:
                    ram_usage = float(ram_result[0]["value"][1])
            except Exception as e:
                logger.debug(f"RAM query failed for {node_name}: {e}")

            try:
                # Disk usage for root filesystem
                disk_query = f'(1 - (node_filesystem_avail_bytes{{instance=~"{node_ip}:.*", mountpoint="/", fstype!="tmpfs"}} / node_filesystem_size_bytes{{instance=~"{node_ip}:.*", mountpoint="/", fstype!="tmpfs"}})) * 100'
                disk_result = prom.custom_query(disk_query)
                if disk_result:
                    disk_usage = float(disk_result[0]["value"][1])
            except Exception as e:
                logger.debug(f"Disk query failed for {node_name}: {e}")

        # Determine health status
        has_metrics = cpu_usage is not None or ram_usage is not None
        if status == "NotReady":
            health = "error"
        elif not has_metrics:
            health = "unknown"  # No metrics data available
        elif (cpu_usage is not None and cpu_usage >= 80) or (ram_usage is not None and ram_usage >= 85):
            health = "warning"
        else:
            health = "healthy"

        nodes.append({
            "name": node_name,
            "ip": node_ip,
            "status": status,
            "cpu": round(cpu_usage, 1) if cpu_usage is not None else None,
            "ram": round(ram_usage, 1) if ram_usage is not None else None,
            "disk": round(disk_usage, 1) if disk_usage is not None else None,
            "health": health,
        })

    return nodes


async def get_active_alerts() -> List[Dict[str, Any]]:
    """
    Get firing alerts from Prometheus.

    Query: ALERTS{alertstate="firing"}
    """
    if not config.prometheus.enabled or not prom:
        return []

    alerts = []

    try:
        result = prom.custom_query('ALERTS{alertstate="firing"}')

        for item in result:
            metric = item.get("metric", {})
            alertname = metric.get("alertname", "Unknown")
            instance = metric.get("instance", "")
            severity = metric.get("severity", "warning")
            description = metric.get("description", metric.get("summary", f"Alert: {alertname}"))

            alert_id = f"{alertname}_{instance}".replace(":", "_").replace("/", "_")

            alerts.append({
                "id": alert_id,
                "alertname": alertname,
                "severity": severity,
                "instance": instance,
                "description": description,
                "category": categorize_alert(alertname),
                "time": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.warning(f"Failed to get alerts from Prometheus: {e}")

    return alerts


async def get_service_status() -> Dict[str, Any]:
    """
    Health check all configured services.

    - HTTP GET with 5s timeout
    - status: "up" if response <400, "degraded" if 4xx/5xx, "down" if timeout/error
    """
    services = []
    up_count = 0

    if not config.services:
        return {
            "services": [],
            "healthScore": 100.0,
            "upCount": 0,
            "totalCount": 0,
        }

    async def check_service(service_config) -> Dict[str, Any]:
        name = service_config.name
        url = service_config.url
        host = service_config.host
        health_path = service_config.health_path or ""
        status = "down"
        response_time = None

        # Construct full URL with optional health path
        check_url = url.rstrip("/") + health_path if health_path else url

        try:
            timeout = aiohttp.ClientTimeout(total=5)
            headers = {"Host": host} if host else {}
            async with aiohttp.ClientSession(timeout=timeout) as session:
                start = datetime.now()
                # Don't follow redirects - a 3xx response means the service is up
                async with session.get(check_url, ssl=False, headers=headers, allow_redirects=False) as response:
                    response_time = (datetime.now() - start).total_seconds() * 1000
                    if response.status < 400:
                        status = "up"
                    else:
                        status = "degraded"
        except asyncio.TimeoutError:
            status = "down"
        except Exception as e:
            logger.debug(f"Service check failed for {name}: {e}")
            status = "down"

        # Return the friendly URL (with host) for display
        display_url = f"http://{host}" if host else url
        return {
            "name": name,
            "url": display_url,
            "status": status,
            "responseTime": round(response_time, 1) if response_time else None,
        }

    # Check all services concurrently
    results = await asyncio.gather(*[check_service(s) for s in config.services])

    for result in results:
        services.append(result)
        if result["status"] == "up":
            up_count += 1

    total_count = len(config.services)
    health_score = (up_count / total_count) * 100 if total_count > 0 else 0

    return {
        "services": services,
        "healthScore": round(health_score, 1),
        "upCount": up_count,
        "totalCount": total_count,
    }


async def get_cluster_overview() -> Dict[str, Any]:
    """
    Get K8s cluster state.

    - List all pods, count by phase (Running/Pending/Failed)
    - Count namespaces
    - Node count and ready count
    """
    overview = {
        "pods": {"running": 0, "pending": 0, "failed": 0, "total": 0},
        "namespaces": 0,
        "nodes": 0,
        "nodesReady": 0,
    }

    if not config.kubernetes.enabled or not k8s_core_v1:
        return overview

    try:
        # Get pods
        pods = k8s_core_v1.list_pod_for_all_namespaces()
        for pod in pods.items:
            phase = pod.status.phase
            overview["pods"]["total"] += 1
            if phase == "Running":
                overview["pods"]["running"] += 1
            elif phase == "Pending":
                overview["pods"]["pending"] += 1
            elif phase in ("Failed", "Unknown"):
                overview["pods"]["failed"] += 1
    except Exception as e:
        logger.warning(f"Failed to get pods: {e}")

    try:
        # Get namespaces
        namespaces = k8s_core_v1.list_namespace()
        overview["namespaces"] = len(namespaces.items)
    except Exception as e:
        logger.warning(f"Failed to get namespaces: {e}")

    try:
        # Get nodes
        nodes = k8s_core_v1.list_node()
        overview["nodes"] = len(nodes.items)
        for node in nodes.items:
            for condition in node.status.conditions or []:
                if condition.type == "Ready" and condition.status == "True":
                    overview["nodesReady"] += 1
                    break
    except Exception as e:
        logger.warning(f"Failed to get nodes: {e}")

    return overview


async def get_recent_activity() -> List[Dict[str, Any]]:
    """
    Get recent K8s events.

    - List events (limit 20)
    - Format time as relative (5m, 2h, 1d)
    - Extract: time, message (truncated to 80 chars), type, source
    """
    if not config.kubernetes.enabled or not k8s_core_v1:
        return []

    activities = []

    try:
        events = k8s_core_v1.list_event_for_all_namespaces(limit=20)
        now = datetime.now(timezone.utc)

        # Sort by last timestamp descending
        sorted_events = sorted(
            events.items,
            key=lambda e: e.last_timestamp or e.event_time or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )

        for event in sorted_events[:10]:
            event_time = event.last_timestamp or event.event_time
            if event_time:
                if event_time.tzinfo is None:
                    event_time = event_time.replace(tzinfo=timezone.utc)
                delta = now - event_time
                time_ago = format_time_ago(delta)
            else:
                time_ago = "unknown"

            message = event.message or ""
            if len(message) > 80:
                message = message[:77] + "..."

            source_component = ""
            if event.source and event.source.component:
                source_component = event.source.component

            activities.append({
                "time": time_ago,
                "message": message,
                "type": event.type or "Normal",
                "source": source_component,
                "namespace": event.metadata.namespace,
                "reason": event.reason,
            })
    except Exception as e:
        logger.warning(f"Failed to get events: {e}")

    return activities


async def get_network_status() -> Dict[str, Any]:
    """
    Get network topology and status from Fortigate API.

    Fetches:
    - System status: hostname, model, firmware version, uptime, cpu, memory
    - Interfaces: name, IP, status, speed, rx/tx bytes, bandwidth rate
    - DHCP leases: active lease count
    - ARP table: device count on network
    """
    global _previous_interface_stats, _last_interface_poll

    network = {
        "firewall": {
            "hostname": "Unknown",
            "model": "Unknown",
            "firmware": "Unknown",
            "uptime": 0,
            "uptimeFormatted": "Unknown",
            "cpu": 0,
            "memory": 0,
            "status": "unknown",
        },
        "interfaces": [],
        "dhcpLeases": 0,
        "deviceCount": 0,
        "available": False,
    }

    if not config.firewall.enabled:
        return network

    if not FORTIGATE_API_KEY:
        logger.debug(f"Firewall API key not found in {config.firewall.token_env_var}")
        return network

    # Currently only FortiGate is supported
    if config.firewall.type != "fortigate":
        logger.debug(f"Firewall type '{config.firewall.type}' not yet supported")
        return network

    headers = {
        "Authorization": f"Bearer {FORTIGATE_API_KEY}",
        "Content-Type": "application/json",
    }

    now = datetime.now(timezone.utc)
    fortigate_url = config.firewall.host

    try:
        timeout = aiohttp.ClientTimeout(total=10)
        connector = aiohttp.TCPConnector(ssl=config.firewall.verify_ssl)

        async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
            # Get system status (hostname, model, version)
            try:
                async with session.get(
                    f"{fortigate_url}/api/v2/monitor/system/status",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", {})
                        network["firewall"]["hostname"] = results.get("hostname", "Unknown")
                        model_name = results.get("model_name", "FortiGate")
                        model_number = results.get("model_number", "")
                        network["firewall"]["model"] = f"{model_name}-{model_number}" if model_number else model_name
                        # Version is in top-level response, not results
                        network["firewall"]["firmware"] = data.get("version", "Unknown")
                        network["firewall"]["status"] = "online"
                        network["available"] = True
                        logger.debug(f"Fortigate status: hostname={network['firewall']['hostname']}, model={network['firewall']['model']}, firmware={network['firewall']['firmware']}")
            except Exception as e:
                logger.debug(f"Fortigate system status failed: {e}")

            # Get CPU/memory from resource/usage endpoint (FortiOS 7.x)
            try:
                async with session.get(
                    f"{fortigate_url}/api/v2/monitor/system/resource/usage",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", {})
                        # CPU is in results.cpu[0].current
                        cpu_data = results.get("cpu", [])
                        if isinstance(cpu_data, list) and len(cpu_data) > 0:
                            network["firewall"]["cpu"] = round(cpu_data[0].get("current", 0), 1)
                        # Memory is in results.mem[0].current
                        mem_data = results.get("mem", [])
                        if isinstance(mem_data, list) and len(mem_data) > 0:
                            network["firewall"]["memory"] = round(mem_data[0].get("current", 0), 1)
                        logger.debug(f"Fortigate resource/usage: cpu={network['firewall']['cpu']}, mem={network['firewall']['memory']}")
            except Exception as e:
                logger.debug(f"Fortigate resource/usage failed: {e}")

            # Get uptime from performance/status endpoint (fallback for older firmware)
            try:
                async with session.get(
                    f"{fortigate_url}/api/v2/monitor/system/performance/status",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", {})
                        # Uptime in seconds
                        uptime_seconds = results.get("uptime", 0)
                        if uptime_seconds > 0:
                            network["firewall"]["uptime"] = uptime_seconds
                            network["firewall"]["uptimeFormatted"] = format_uptime(uptime_seconds)
                        logger.debug(f"Fortigate performance/status: uptime={uptime_seconds}")
            except Exception as e:
                logger.debug(f"Fortigate performance/status failed: {e}")

            # Get interfaces with bandwidth calculation
            try:
                async with session.get(
                    f"{fortigate_url}/api/v2/monitor/system/interface",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", {})

                        # Calculate time delta for bandwidth rate
                        time_delta_seconds = 5.0  # default
                        if _last_interface_poll:
                            time_delta_seconds = max((now - _last_interface_poll).total_seconds(), 1.0)

                        for iface_name, iface_data in results.items():
                            # Only include physical and important interfaces
                            if iface_data.get("type") in ("physical", "vlan", "aggregate") or iface_name in ("wan1", "wan2", "lan", "internal"):
                                # Get IP address
                                ip_addr = ""
                                if iface_data.get("ip"):
                                    ip_addr = iface_data["ip"]
                                elif isinstance(iface_data.get("ipv4"), list) and iface_data["ipv4"]:
                                    ip_addr = iface_data["ipv4"][0].get("ip", "")

                                rx_bytes = iface_data.get("rx_bytes", 0)
                                tx_bytes = iface_data.get("tx_bytes", 0)

                                # Calculate bandwidth rate (Mbps)
                                rx_rate = 0.0
                                tx_rate = 0.0
                                if iface_name in _previous_interface_stats and time_delta_seconds > 0:
                                    prev = _previous_interface_stats[iface_name]
                                    rx_delta = rx_bytes - prev.get("rx_bytes", rx_bytes)
                                    tx_delta = tx_bytes - prev.get("tx_bytes", tx_bytes)
                                    # Handle counter wrap or reset
                                    if rx_delta >= 0:
                                        rx_rate = (rx_delta * 8) / (time_delta_seconds * 1_000_000)  # Mbps
                                    if tx_delta >= 0:
                                        tx_rate = (tx_delta * 8) / (time_delta_seconds * 1_000_000)  # Mbps

                                # Store current values for next calculation
                                _previous_interface_stats[iface_name] = {
                                    "rx_bytes": rx_bytes,
                                    "tx_bytes": tx_bytes,
                                }

                                network["interfaces"].append({
                                    "name": iface_name,
                                    "ip": ip_addr,
                                    "status": "up" if iface_data.get("link") else "down",
                                    "speed": iface_data.get("speed", 0),
                                    "rxBytes": rx_bytes,
                                    "txBytes": tx_bytes,
                                    "rxRate": round(rx_rate, 2),  # Mbps
                                    "txRate": round(tx_rate, 2),  # Mbps
                                })

                        _last_interface_poll = now
            except Exception as e:
                logger.debug(f"Fortigate interface status failed: {e}")

            # Get DHCP leases count
            try:
                async with session.get(
                    f"{fortigate_url}/api/v2/monitor/system/dhcp",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", [])
                        # FortiOS 7.x returns flat list of leases
                        if isinstance(results, list):
                            # Count items that have 'ip' and 'mac' (actual leases)
                            lease_count = sum(1 for item in results if isinstance(item, dict) and item.get("ip") and item.get("mac"))
                            network["dhcpLeases"] = lease_count
                            logger.debug(f"DHCP leases: {lease_count}")
            except Exception as e:
                logger.debug(f"Fortigate DHCP status failed: {e}")

            # Get ARP table for device count
            try:
                async with session.get(
                    f"{fortigate_url}/api/v2/monitor/network/arp",
                    headers=headers,
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", [])
                        # Count unique MAC addresses (excluding incomplete entries)
                        macs = set()
                        for entry in results:
                            mac = entry.get("mac", "")
                            if mac and mac != "00:00:00:00:00:00":
                                macs.add(mac)
                        network["deviceCount"] = len(macs)
            except Exception as e:
                logger.debug(f"Fortigate ARP table failed: {e}")

    except Exception as e:
        logger.warning(f"Fortigate API connection failed: {e}")
        network["firewall"]["status"] = "error"

    return network


# =============================================================================
# REST Endpoints
# =============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    prometheus_ok = False
    kubernetes_ok = False

    if config.prometheus.enabled and prom:
        try:
            prom.custom_query("up")
            prometheus_ok = True
        except Exception:
            pass

    if config.kubernetes.enabled and k8s_core_v1:
        try:
            k8s_core_v1.list_namespace(limit=1)
            kubernetes_ok = True
        except Exception:
            pass

    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "components": {
            "prometheus": "connected" if prometheus_ok else ("disabled" if not config.prometheus.enabled else "disconnected"),
            "kubernetes": "connected" if kubernetes_ok else ("disabled" if not config.kubernetes.enabled else "disconnected"),
            "firewall": "enabled" if config.firewall.enabled else "disabled",
        },
    }


@app.get("/api/config")
async def get_public_config():
    """
    Get public configuration for the frontend.

    Returns dashboard settings and enabled features.
    Does NOT expose sensitive information like API tokens or internal URLs.
    """
    return {
        "dashboard": {
            "title": config.dashboard.title,
            "version": config.dashboard.version,
            "tagline": config.dashboard.tagline,
        },
        "features": {
            "prometheus": config.prometheus.enabled,
            "kubernetes": config.kubernetes.enabled,
            "firewall": config.firewall.enabled,
            "firewallType": config.firewall.type if config.firewall.enabled else None,
        }
    }


@app.get("/api/nodes")
async def get_nodes():
    """Get node metrics."""
    nodes = await get_node_metrics()
    return {"nodes": nodes, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/alerts")
async def get_alerts():
    """Get active alerts."""
    alerts = await get_active_alerts()
    return {"alerts": alerts, "count": len(alerts), "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/services")
async def get_services():
    """Get service status."""
    status = await get_service_status()
    status["timestamp"] = datetime.now(timezone.utc).isoformat()
    return status


@app.get("/api/network")
async def get_network():
    """Get network topology and status from Fortigate."""
    network = await get_network_status()
    network["timestamp"] = datetime.now(timezone.utc).isoformat()
    return network


@app.get("/api/dashboard")
async def get_dashboard():
    """
    Get complete dashboard data.

    Only includes data for enabled features.
    """
    # Build list of tasks based on enabled features
    tasks = [get_service_status()]  # Always fetch services

    if config.prometheus.enabled:
        tasks.extend([get_node_metrics(), get_active_alerts()])

    if config.kubernetes.enabled:
        tasks.extend([get_cluster_overview(), get_recent_activity()])

    if config.firewall.enabled:
        tasks.append(get_network_status())

    # Gather all data concurrently
    results = await asyncio.gather(*tasks)

    # Build response based on what was fetched
    result_idx = 0

    # Services (always present)
    services = results[result_idx]
    result_idx += 1

    data: Dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": services,
    }

    # Infrastructure (Prometheus nodes + K8s cluster)
    if config.prometheus.enabled or config.kubernetes.enabled:
        data["infrastructure"] = {}

        if config.prometheus.enabled:
            data["infrastructure"]["nodes"] = results[result_idx]
            result_idx += 1
            data["alerts"] = {
                "items": results[result_idx],
                "count": len(results[result_idx]),
            }
            result_idx += 1
        else:
            data["infrastructure"]["nodes"] = []
            data["alerts"] = {"items": [], "count": 0}

        if config.kubernetes.enabled:
            data["infrastructure"]["cluster"] = results[result_idx]
            result_idx += 1
            data["activity"] = results[result_idx]
            result_idx += 1
        else:
            data["infrastructure"]["cluster"] = {
                "pods": {"running": 0, "pending": 0, "failed": 0, "total": 0},
                "namespaces": 0,
                "nodes": 0,
                "nodesReady": 0,
            }
            data["activity"] = []
    else:
        # No infrastructure features enabled - provide empty defaults
        data["infrastructure"] = {
            "nodes": [],
            "cluster": {
                "pods": {"running": 0, "pending": 0, "failed": 0, "total": 0},
                "namespaces": 0,
                "nodes": 0,
                "nodesReady": 0,
            }
        }
        data["alerts"] = {"items": [], "count": 0}
        data["activity"] = []

    # Network (Firewall)
    if config.firewall.enabled:
        data["network"] = results[result_idx]
        result_idx += 1
    else:
        data["network"] = {
            "firewall": {
                "hostname": "Unknown",
                "model": "Unknown",
                "firmware": "Unknown",
                "uptime": 0,
                "uptimeFormatted": "Unknown",
                "cpu": 0,
                "memory": 0,
                "status": "unknown",
            },
            "interfaces": [],
            "dhcpLeases": 0,
            "deviceCount": 0,
            "available": False,
        }

    return data


# =============================================================================
# WebSocket Endpoint
# =============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time dashboard updates."""
    await manager.connect(websocket)

    try:
        while True:
            # Gather all dashboard data
            data = await get_dashboard()

            # Send to client
            await websocket.send_json(data)

            # Wait 5 seconds before next update
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# =============================================================================
# Static File Serving (for unified Docker image)
# =============================================================================

# Check if static files exist (built frontend)
static_dir = Path(__file__).parent / "static"
if static_dir.exists() and (static_dir / "index.html").exists():
    # Mount assets directory
    if (static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="assets")

    # Serve index.html for all non-API routes (SPA routing)
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the frontend SPA for all non-API routes."""
        # Don't serve frontend for API or WebSocket routes
        if full_path.startswith("api/") or full_path.startswith("ws"):
            return {"error": "Not found"}
        return FileResponse(str(static_dir / "index.html"))


# =============================================================================
# Main
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
