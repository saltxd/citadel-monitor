import { AlertTriangle, AlertCircle, Info, CheckCircle, Bell } from 'lucide-react'
import { Alert } from '../types'

interface Props {
  alerts: Alert[]
}

export default function AlertFeed({ alerts }: Props) {
  // Group alerts by severity
  const criticalAlerts = alerts.filter(a => a.severity === 'critical')
  const warningAlerts = alerts.filter(a => a.severity === 'warning')
  const infoAlerts = alerts.filter(a => a.severity === 'info' || a.severity === 'none')

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          icon: AlertCircle,
          bgColor: 'bg-red-900/20',
          borderColor: 'border-red-600',
          textColor: 'text-red-400',
          label: 'CRITICAL',
        }
      case 'warning':
        return {
          icon: AlertTriangle,
          bgColor: 'bg-yellow-900/20',
          borderColor: 'border-yellow-600',
          textColor: 'text-yellow-400',
          label: 'WARNING',
        }
      default:
        return {
          icon: Info,
          bgColor: 'bg-blue-900/20',
          borderColor: 'border-blue-600',
          textColor: 'text-blue-400',
          label: 'INFO',
        }
    }
  }

  const renderAlertSection = (sectionAlerts: Alert[], severity: string) => {
    if (sectionAlerts.length === 0) return null

    const config = getSeverityConfig(severity)
    const Icon = config.icon

    return (
      <div className={`border ${config.borderColor} ${config.bgColor} p-3 mb-3`}>
        <div className="flex items-center gap-2 mb-2">
          <Icon size={16} className={config.textColor} />
          <span className={`text-sm font-bold ${config.textColor}`}>
            {config.label} ({sectionAlerts.length})
          </span>
        </div>
        <div className="space-y-2">
          {sectionAlerts.map((alert) => (
            <div
              key={alert.id}
              className="border-l-2 border-current pl-3 py-1"
              style={{ borderColor: 'currentColor' }}
            >
              <div className={`font-medium ${config.textColor}`}>
                {alert.alertname}
              </div>
              <div className="text-xs text-green-600 mt-1">
                {alert.description}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-green-700">
                {alert.instance && <span>INSTANCE: {alert.instance}</span>}
                <span>CATEGORY: {alert.category.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-green-600 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Bell size={18} className="text-green-400" />
        <h2 className="text-lg font-bold text-green-400">ALERT FEED</h2>
        <span className="text-green-600 text-sm ml-auto">
          {alerts.length} ACTIVE
        </span>
      </div>

      {alerts.length === 0 ? (
        <div className="border border-green-800 bg-green-900/10 p-6 text-center">
          <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
          <p className="text-green-400 font-medium">ALL SYSTEMS OPERATIONAL</p>
          <p className="text-green-600 text-sm mt-1">No active alerts</p>
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {renderAlertSection(criticalAlerts, 'critical')}
          {renderAlertSection(warningAlerts, 'warning')}
          {renderAlertSection(infoAlerts, 'info')}
        </div>
      )}

      {/* Alert Summary */}
      <div className="border-t border-green-800 pt-3 mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className="text-red-400">
            <AlertCircle size={12} className="inline mr-1" />
            {criticalAlerts.length} CRITICAL
          </span>
          <span className="text-yellow-400">
            <AlertTriangle size={12} className="inline mr-1" />
            {warningAlerts.length} WARNING
          </span>
          <span className="text-blue-400">
            <Info size={12} className="inline mr-1" />
            {infoAlerts.length} INFO
          </span>
        </div>
      </div>
    </div>
  )
}
