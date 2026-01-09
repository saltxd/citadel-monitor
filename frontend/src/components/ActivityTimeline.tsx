import { Clock, AlertTriangle, Info, CheckCircle } from 'lucide-react'
import { ActivityItem } from '../types'

interface Props {
  activity: ActivityItem[]
}

export default function ActivityTimeline({ activity }: Props) {
  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'Warning':
        return {
          icon: AlertTriangle,
          color: 'text-yellow-400',
          borderColor: 'border-yellow-600',
          dotColor: 'bg-yellow-400',
        }
      case 'Error':
        return {
          icon: AlertTriangle,
          color: 'text-red-400',
          borderColor: 'border-red-600',
          dotColor: 'bg-red-400',
        }
      default:
        return {
          icon: CheckCircle,
          color: 'text-green-400',
          borderColor: 'border-green-600',
          dotColor: 'bg-green-400',
        }
    }
  }

  return (
    <div className="border border-green-600 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={18} className="text-green-400" />
        <h2 className="text-lg font-bold text-green-400">ACTIVITY TIMELINE</h2>
        <span className="text-green-600 text-sm ml-auto">
          {activity.length} EVENTS
        </span>
      </div>

      {activity.length === 0 ? (
        <div className="border border-green-800 bg-green-900/10 p-6 text-center">
          <Info size={24} className="mx-auto mb-2 text-green-600" />
          <p className="text-green-600 text-sm">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {activity.map((item, index) => {
            const config = getTypeConfig(item.type)

            return (
              <div
                key={index}
                className="flex items-start gap-3 border-l-2 pl-3 py-2"
                style={{ borderColor: config.dotColor.replace('bg-', '') }}
              >
                {/* Time */}
                <div className="text-xs text-green-600 w-12 flex-shrink-0 pt-0.5">
                  {item.time}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${config.color} break-words`}>
                    {item.message}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {item.source && (
                      <span className="text-xs text-green-700">
                        {item.source}
                      </span>
                    )}
                    {item.namespace && (
                      <>
                        <span className="text-green-800">|</span>
                        <span className="text-xs text-green-700">
                          {item.namespace}
                        </span>
                      </>
                    )}
                    {item.reason && (
                      <>
                        <span className="text-green-800">|</span>
                        <span className={`text-xs ${config.color}`}>
                          {item.reason}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Type Badge */}
                <div
                  className={`text-xs px-2 py-0.5 border ${config.borderColor} ${config.color} flex-shrink-0`}
                >
                  {item.type}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
