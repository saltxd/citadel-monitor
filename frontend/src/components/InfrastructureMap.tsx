import { Server, Cpu, HardDrive, MemoryStick } from 'lucide-react'
import { Node, ClusterOverview } from '../types'

interface Props {
  nodes: Node[]
  cluster: ClusterOverview
}

export default function InfrastructureMap({ nodes, cluster }: Props) {
  const getHealthColor = (health: string) => {
    switch (health) {
      case 'healthy':
        return 'border-green-600 bg-green-900/10'
      case 'warning':
        return 'border-yellow-600 bg-yellow-900/10'
      case 'error':
        return 'border-red-600 bg-red-900/10'
      case 'unknown':
        return 'border-gray-600 bg-gray-900/10'
      default:
        return 'border-green-600 bg-green-900/10'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Ready':
        return 'text-green-400'
      case 'NotReady':
        return 'text-red-400'
      default:
        return 'text-yellow-400'
    }
  }

  const getMetricColor = (value: number | null, type: 'cpu' | 'ram' | 'disk') => {
    if (value === null) return 'bg-gray-600'
    const thresholds = {
      cpu: { warning: 70, critical: 85 },
      ram: { warning: 75, critical: 90 },
      disk: { warning: 80, critical: 95 },
    }
    const { warning, critical } = thresholds[type]

    if (value >= critical) return 'bg-red-500'
    if (value >= warning) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getMetricTextColor = (value: number | null, type: 'cpu' | 'ram' | 'disk') => {
    if (value === null) return 'text-gray-500'
    const thresholds = {
      cpu: { warning: 70, critical: 85 },
      ram: { warning: 75, critical: 90 },
      disk: { warning: 80, critical: 95 },
    }
    const { warning, critical } = thresholds[type]

    if (value >= critical) return 'text-red-400'
    if (value >= warning) return 'text-yellow-400'
    return 'text-green-400'
  }

  const formatMetric = (value: number | null) => {
    return value !== null ? `${value.toFixed(1)}%` : 'N/A'
  }

  return (
    <div className="border border-green-600 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Server size={18} className="text-green-400" />
        <h2 className="text-lg font-bold text-green-400">INFRASTRUCTURE MAP</h2>
        <span className="text-green-600 text-sm ml-auto">
          {cluster.nodesReady}/{cluster.nodes} NODES READY
        </span>
      </div>

      {/* Node Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {nodes.map((node) => (
          <div
            key={node.name}
            className={`border p-4 ${getHealthColor(node.health)}`}
          >
            {/* Node Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-green-400" />
                <span className="font-bold text-green-300">{node.name}</span>
              </div>
              <span className={`text-sm font-medium ${getStatusColor(node.status)}`}>
                [{node.status.toUpperCase()}]
              </span>
            </div>

            {/* IP Address */}
            <div className="text-xs text-green-600 mb-3">{node.ip}</div>

            {/* Metrics */}
            <div className="space-y-2">
              {/* CPU */}
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-green-600" />
                <span className="text-xs text-green-600 w-10">CPU</span>
                <div className="flex-1 h-2 bg-green-900/30 rounded overflow-hidden">
                  <div
                    className={`h-full ${getMetricColor(node.cpu, 'cpu')} transition-all duration-500`}
                    style={{ width: node.cpu !== null ? `${Math.min(node.cpu, 100)}%` : '0%' }}
                  />
                </div>
                <span className={`text-xs w-12 text-right ${getMetricTextColor(node.cpu, 'cpu')}`}>
                  {formatMetric(node.cpu)}
                </span>
              </div>

              {/* RAM */}
              <div className="flex items-center gap-2">
                <MemoryStick size={14} className="text-green-600" />
                <span className="text-xs text-green-600 w-10">RAM</span>
                <div className="flex-1 h-2 bg-green-900/30 rounded overflow-hidden">
                  <div
                    className={`h-full ${getMetricColor(node.ram, 'ram')} transition-all duration-500`}
                    style={{ width: node.ram !== null ? `${Math.min(node.ram, 100)}%` : '0%' }}
                  />
                </div>
                <span className={`text-xs w-12 text-right ${getMetricTextColor(node.ram, 'ram')}`}>
                  {formatMetric(node.ram)}
                </span>
              </div>

              {/* Disk */}
              <div className="flex items-center gap-2">
                <HardDrive size={14} className="text-green-600" />
                <span className="text-xs text-green-600 w-10">DISK</span>
                <div className="flex-1 h-2 bg-green-900/30 rounded overflow-hidden">
                  <div
                    className={`h-full ${getMetricColor(node.disk, 'disk')} transition-all duration-500`}
                    style={{ width: node.disk !== null ? `${Math.min(node.disk, 100)}%` : '0%' }}
                  />
                </div>
                <span className={`text-xs w-12 text-right ${getMetricTextColor(node.disk, 'disk')}`}>
                  {formatMetric(node.disk)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cluster Summary */}
      <div className="border-t border-green-800 pt-3 grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-400">
            {cluster.pods.running}
          </div>
          <div className="text-xs text-green-600">RUNNING PODS</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${cluster.pods.pending > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
            {cluster.pods.pending}
          </div>
          <div className="text-xs text-green-600">PENDING</div>
        </div>
        <div>
          <div className={`text-2xl font-bold ${cluster.pods.failed > 0 ? 'text-red-400' : 'text-green-400'}`}>
            {cluster.pods.failed}
          </div>
          <div className="text-xs text-green-600">FAILED</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-400">
            {cluster.namespaces}
          </div>
          <div className="text-xs text-green-600">NAMESPACES</div>
        </div>
      </div>
    </div>
  )
}
