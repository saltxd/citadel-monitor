import { Activity, Cpu, MemoryStick, HardDrive, Box } from 'lucide-react'
import { Node, ClusterOverview } from '../types'

interface Props {
  nodes: Node[]
  cluster: ClusterOverview
}

export default function MetricsPanel({ nodes, cluster }: Props) {
  // Calculate cluster-wide averages (only from nodes with data)
  const nodesWithCpu = nodes.filter(n => n.cpu !== null)
  const nodesWithRam = nodes.filter(n => n.ram !== null)
  const nodesWithDisk = nodes.filter(n => n.disk !== null)

  const avgCpu = nodesWithCpu.length > 0
    ? nodesWithCpu.reduce((sum, n) => sum + (n.cpu || 0), 0) / nodesWithCpu.length
    : null
  const avgRam = nodesWithRam.length > 0
    ? nodesWithRam.reduce((sum, n) => sum + (n.ram || 0), 0) / nodesWithRam.length
    : null
  const avgDisk = nodesWithDisk.length > 0
    ? nodesWithDisk.reduce((sum, n) => sum + (n.disk || 0), 0) / nodesWithDisk.length
    : null

  const getMetricStatus = (value: number | null, type: 'cpu' | 'ram' | 'disk') => {
    if (value === null) {
      return { color: 'text-gray-500', bgColor: 'bg-gray-600', status: 'NO DATA' }
    }
    const thresholds = {
      cpu: { warning: 70, critical: 85 },
      ram: { warning: 75, critical: 90 },
      disk: { warning: 80, critical: 95 },
    }
    const { warning, critical } = thresholds[type]

    if (value >= critical) return { color: 'text-red-400', bgColor: 'bg-red-500', status: 'CRITICAL' }
    if (value >= warning) return { color: 'text-yellow-400', bgColor: 'bg-yellow-500', status: 'WARNING' }
    return { color: 'text-green-400', bgColor: 'bg-green-500', status: 'NORMAL' }
  }

  const metrics = [
    {
      label: 'CPU USAGE',
      value: avgCpu,
      type: 'cpu' as const,
      icon: Cpu,
    },
    {
      label: 'MEMORY USAGE',
      value: avgRam,
      type: 'ram' as const,
      icon: MemoryStick,
    },
    {
      label: 'DISK USAGE',
      value: avgDisk,
      type: 'disk' as const,
      icon: HardDrive,
    },
  ]

  return (
    <div className="border border-green-600 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={18} className="text-green-400" />
        <h2 className="text-lg font-bold text-green-400">CLUSTER METRICS</h2>
      </div>

      <div className="space-y-4">
        {metrics.map((metric) => {
          const status = getMetricStatus(metric.value, metric.type)
          const Icon = metric.icon

          return (
            <div key={metric.label} className="border border-green-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-green-600" />
                  <span className="text-sm text-green-600">{metric.label}</span>
                </div>
                <span className={`text-xs ${status.color}`}>{status.status}</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-4 bg-green-900/30 rounded overflow-hidden">
                  <div
                    className={`h-full ${status.bgColor} transition-all duration-500`}
                    style={{ width: metric.value !== null ? `${Math.min(metric.value, 100)}%` : '0%' }}
                  />
                </div>
                <span className={`text-xl font-bold ${status.color} w-20 text-right`}>
                  {metric.value !== null ? `${metric.value.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Pod Status */}
      <div className="border-t border-green-800 mt-4 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Box size={14} className="text-green-600" />
          <span className="text-sm text-green-600">POD STATUS</span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="border border-green-800 p-2">
            <div className="text-xl font-bold text-green-400">
              {cluster.pods.running}
            </div>
            <div className="text-xs text-green-600">RUNNING</div>
          </div>
          <div className="border border-green-800 p-2">
            <div className={`text-xl font-bold ${cluster.pods.pending > 0 ? 'text-yellow-400' : 'text-green-400'}`}>
              {cluster.pods.pending}
            </div>
            <div className="text-xs text-green-600">PENDING</div>
          </div>
          <div className="border border-green-800 p-2">
            <div className={`text-xl font-bold ${cluster.pods.failed > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {cluster.pods.failed}
            </div>
            <div className="text-xs text-green-600">FAILED</div>
          </div>
        </div>
      </div>
    </div>
  )
}
