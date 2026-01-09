import { Globe, CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react'
import { ServiceStatus } from '../types'

interface Props {
  serviceStatus: ServiceStatus
}

export default function ServiceHealth({ serviceStatus }: Props) {
  const { services, healthScore, upCount, totalCount } = serviceStatus

  const getHealthScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-400'
    if (score >= 70) return 'text-yellow-400'
    return 'text-red-400'
  }

  const getHealthScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-500'
    if (score >= 70) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up':
        return <CheckCircle size={14} className="text-green-400" />
      case 'degraded':
        return <AlertTriangle size={14} className="text-yellow-400" />
      case 'down':
        return <XCircle size={14} className="text-red-400" />
      default:
        return <XCircle size={14} className="text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up':
        return 'text-green-400'
      case 'degraded':
        return 'text-yellow-400'
      case 'down':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const getOverallStatus = () => {
    if (healthScore >= 90) return { text: 'ALL SYSTEMS NOMINAL', color: 'text-green-400' }
    if (healthScore >= 70) return { text: 'DEGRADED PERFORMANCE', color: 'text-yellow-400' }
    return { text: 'CRITICAL ISSUES DETECTED', color: 'text-red-400' }
  }

  const overallStatus = getOverallStatus()

  return (
    <div className="border border-green-600 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Globe size={18} className="text-green-400" />
        <h2 className="text-lg font-bold text-green-400">SERVICE HEALTH</h2>
      </div>

      {/* Health Score */}
      <div className="border border-green-800 p-4 mb-4 text-center">
        <div className={`text-4xl font-bold ${getHealthScoreColor(healthScore)}`}>
          {healthScore.toFixed(0)}%
        </div>
        <div className="h-2 bg-green-900/30 rounded mt-2 overflow-hidden">
          <div
            className={`h-full ${getHealthScoreBgColor(healthScore)} transition-all duration-500`}
            style={{ width: `${healthScore}%` }}
          />
        </div>
        <div className="text-sm text-green-600 mt-2">
          {upCount}/{totalCount} SERVICES UP
        </div>
      </div>

      {/* Service List */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-center justify-between border border-green-800 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              {getStatusIcon(service.status)}
              <span className="text-sm text-green-300">{service.name}</span>
            </div>
            <div className="flex items-center gap-3">
              {service.responseTime !== null && (
                <span className="text-xs text-green-600 flex items-center gap-1">
                  <Zap size={10} />
                  {service.responseTime.toFixed(0)}ms
                </span>
              )}
              <span className={`text-xs font-medium ${getStatusColor(service.status)}`}>
                {service.status.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Overall Status */}
      <div className="border-t border-green-800 mt-4 pt-3 text-center">
        <span className={`text-sm font-medium ${overallStatus.color}`}>
          {overallStatus.text}
        </span>
      </div>
    </div>
  )
}
