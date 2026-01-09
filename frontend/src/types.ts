export interface Node {
  name: string;
  ip: string;
  status: string;
  cpu: number | null;
  ram: number | null;
  disk: number | null;
  health: 'healthy' | 'warning' | 'error' | 'unknown';
  error?: string;
}

export interface ClusterOverview {
  pods: {
    running: number;
    pending: number;
    failed: number;
    total: number;
  };
  namespaces: number;
  nodes: number;
  nodesReady: number;
  error?: string;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info' | 'none';
  alertname: string;
  instance: string;
  description: string;
  category: string;
  time: string;
}

export interface Service {
  name: string;
  url: string;
  status: 'up' | 'degraded' | 'down';
  responseTime: number | null;
}

export interface ServiceStatus {
  services: Service[];
  healthScore: number;
  upCount: number;
  totalCount: number;
}

export interface ActivityItem {
  time: string;
  message: string;
  type: string;
  source: string;
  namespace?: string;
  reason?: string;
}

export interface NetworkInterface {
  name: string;
  ip: string;
  status: 'up' | 'down';
  speed: number;
  rxBytes: number;
  txBytes: number;
  rxRate: number;  // Mbps
  txRate: number;  // Mbps
}

export interface Firewall {
  hostname: string;
  model: string;
  firmware: string;
  uptime: number;
  uptimeFormatted: string;
  cpu: number;
  memory: number;
  status: 'online' | 'offline' | 'error' | 'unknown';
}

export interface NetworkStatus {
  firewall: Firewall;
  interfaces: NetworkInterface[];
  dhcpLeases: number;
  deviceCount: number;
  available: boolean;
}

export interface DashboardData {
  infrastructure: {
    nodes: Node[];
    cluster: ClusterOverview;
  };
  alerts: {
    items: Alert[];
    count: number;
  };
  services: ServiceStatus;
  activity: ActivityItem[];
  network: NetworkStatus;
  timestamp: string;
}

export interface AppConfig {
  dashboard: {
    title: string;
    version: string;
    tagline: string | null;
  };
  features: {
    prometheus: boolean;
    kubernetes: boolean;
    firewall: boolean;
    firewallType: string | null;
  };
}
