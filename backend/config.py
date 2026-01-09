"""
Configuration system for Citadel Monitor.

Loads configuration from config.yaml with sensible defaults.
Supports environment variable overrides for sensitive values.
"""

import os
from pathlib import Path
from typing import List, Optional

import yaml
from pydantic import BaseModel, Field


class ServiceConfig(BaseModel):
    """Configuration for a monitored service."""
    name: str
    url: str
    host: Optional[str] = None  # Optional Host header for Traefik routing
    health_path: Optional[str] = Field(default=None, alias="healthPath")

    class Config:
        populate_by_name = True


class NodeConfig(BaseModel):
    """Configuration for a Prometheus node exporter target."""
    name: str
    host: str  # IP:port format, e.g., "192.168.1.10:9100"


class PrometheusConfig(BaseModel):
    """Prometheus integration configuration."""
    enabled: bool = False
    url: str = "http://prometheus:9090"
    nodes: List[NodeConfig] = []


class KubernetesConfig(BaseModel):
    """Kubernetes integration configuration."""
    enabled: bool = False
    kubeconfig: Optional[str] = None  # Path to kubeconfig, None = in-cluster


class FirewallConfig(BaseModel):
    """Firewall integration configuration."""
    enabled: bool = False
    type: str = "none"  # fortigate | pfsense | opnsense | none
    host: str = ""
    token_env_var: str = Field(default="FORTIGATE_TOKEN", alias="tokenEnvVar")
    verify_ssl: bool = Field(default=False, alias="verifySsl")

    class Config:
        populate_by_name = True


class DashboardConfig(BaseModel):
    """Dashboard display configuration."""
    title: str = "CITADEL MONITOR"
    version: str = "v1.0.0"
    tagline: Optional[str] = None


class Config(BaseModel):
    """Root configuration model."""
    dashboard: DashboardConfig = Field(default_factory=DashboardConfig)
    services: List[ServiceConfig] = []
    prometheus: PrometheusConfig = Field(default_factory=PrometheusConfig)
    kubernetes: KubernetesConfig = Field(default_factory=KubernetesConfig)
    firewall: FirewallConfig = Field(default_factory=FirewallConfig)


def load_config() -> Config:
    """
    Load configuration from config.yaml.

    Searches for config.yaml in:
    1. /app/config.yaml (Docker/K8s mount point)
    2. ./config.yaml (current directory)
    3. ../config.yaml (parent directory, for running from backend/)

    Falls back to defaults if no config file found.
    """
    config_paths = [
        Path("/app/config.yaml"),
        Path("./config.yaml"),
        Path("../config.yaml"),
    ]

    # Also check CONFIG_FILE environment variable
    env_config = os.environ.get("CONFIG_FILE")
    if env_config:
        config_paths.insert(0, Path(env_config))

    for path in config_paths:
        if path.exists():
            try:
                with open(path, "r") as f:
                    data = yaml.safe_load(f) or {}
                print(f"Loaded configuration from {path}")
                return Config(**data)
            except Exception as e:
                print(f"Warning: Failed to parse {path}: {e}")
                continue

    print("Warning: No config.yaml found, using defaults")
    return Config()


# Global config instance - loaded once at startup
config = load_config()
