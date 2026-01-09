import { useEffect, useState } from 'react'
import useWebSocket, { ReadyState } from 'react-use-websocket'
import { Wifi, WifiOff, Radio } from 'lucide-react'
import { DashboardData, AppConfig } from './types'
import InfrastructureMap from './components/InfrastructureMap'
import AlertFeed from './components/AlertFeed'
import MetricsPanel from './components/MetricsPanel'
import ServiceHealth from './components/ServiceHealth'
import ActivityTimeline from './components/ActivityTimeline'
import NetworkTopology from './components/NetworkTopology'

const WS_URL = import.meta.env.DEV
  ? 'ws://localhost:8000/ws'
  : `ws://${window.location.host}/ws`

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:8000'
  : ''

function App() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)

  // Fetch configuration on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/config`)
      .then(r => r.json())
      .then((cfg: AppConfig) => {
        setAppConfig(cfg)
        setConfigLoaded(true)
      })
      .catch(err => {
        console.error('Failed to fetch config:', err)
        // Use defaults if config fetch fails
        setAppConfig({
          dashboard: {
            title: 'CITADEL MONITOR',
            version: 'v1.0.0',
            tagline: null,
          },
          features: {
            prometheus: true,
            kubernetes: true,
            firewall: true,
            firewallType: null,
          }
        })
        setConfigLoaded(true)
      })
  }, [])

  const { lastMessage, readyState } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
    reconnectAttempts: 10,
  })

  useEffect(() => {
    if (lastMessage !== null) {
      try {
        const parsed = JSON.parse(lastMessage.data)
        setData(parsed)
        setLastUpdate(new Date())
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
  }, [lastMessage])

  const connectionStatus = {
    [ReadyState.CONNECTING]: { text: 'CONNECTING', color: 'text-yellow-400', Icon: Radio },
    [ReadyState.OPEN]: { text: 'CONNECTED', color: 'text-green-400', Icon: Wifi },
    [ReadyState.CLOSING]: { text: 'CLOSING', color: 'text-yellow-400', Icon: Radio },
    [ReadyState.CLOSED]: { text: 'DISCONNECTED', color: 'text-red-400', Icon: WifiOff },
    [ReadyState.UNINSTANTIATED]: { text: 'UNINSTANTIATED', color: 'text-gray-400', Icon: WifiOff },
  }[readyState]

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Feature flags from config (with defaults for safety)
  const features = appConfig?.features ?? {
    prometheus: false,
    kubernetes: false,
    firewall: false,
    firewallType: null,
  }

  // Show infrastructure panels if prometheus or kubernetes is enabled
  const showInfrastructure = features.prometheus || features.kubernetes
  const showAlerts = features.prometheus
  const showActivity = features.kubernetes
  const showNetwork = features.firewall

  // Dashboard config (with defaults)
  const dashboardTitle = appConfig?.dashboard?.title ?? 'CITADEL MONITOR'
  const dashboardVersion = appConfig?.dashboard?.version ?? 'v1.0.0'

  // Don't render until config is loaded
  if (!configLoaded) {
    return (
      <div className="min-h-screen bg-black text-green-400 font-mono p-2 sm:p-4 flex items-center justify-center">
        <div className="text-center">
          <Radio className="w-16 h-16 mx-auto mb-4 animate-spin text-green-600" />
          <p className="text-xl text-green-600">LOADING CONFIGURATION...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-2 sm:p-4 overflow-x-hidden max-w-full">
      {/* Header */}
      <header className="border border-green-600 p-2 sm:p-4 mb-2 sm:mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <h1 className="text-lg sm:text-2xl font-bold tracking-wider truncate">
              {dashboardTitle}
            </h1>
            <span className="text-green-600 text-xs sm:text-sm">{dashboardVersion}</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm flex-wrap">
            {/* Connection Status */}
            <div className={`flex items-center gap-1 sm:gap-2 ${connectionStatus.color}`}>
              <connectionStatus.Icon
                size={14}
                className={readyState === ReadyState.OPEN ? 'animate-pulse-green' : ''}
              />
              <span className="font-medium">{connectionStatus.text}</span>
            </div>

            {/* Last Update - hidden on very small screens */}
            {lastUpdate && (
              <div className="text-green-600 hidden xs:block">
                {formatTime(lastUpdate)}
              </div>
            )}

            {/* Current Time */}
            <div className="text-green-400">
              <Clock />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {!data ? (
        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center">
            <Radio className="w-16 h-16 mx-auto mb-4 animate-spin text-green-600" />
            <p className="text-xl text-green-600">ESTABLISHING CONNECTION...</p>
            <p className="text-sm text-green-700 mt-2">Waiting for data stream</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-2 sm:gap-4">
          {/* Left Column - Infrastructure, Network, and Alerts */}
          <div className="col-span-12 lg:col-span-8 space-y-2 sm:space-y-4">
            {/* Infrastructure Map - only if prometheus or kubernetes enabled */}
            {showInfrastructure && (
              <InfrastructureMap
                nodes={data.infrastructure.nodes}
                cluster={data.infrastructure.cluster}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
              {/* Network Topology - only if firewall enabled */}
              {showNetwork && (
                <NetworkTopology network={data.network} />
              )}

              {/* Alert Feed - only if prometheus enabled */}
              {showAlerts && (
                <AlertFeed alerts={data.alerts.items} />
              )}

              {/* If only one panel in this row, make it full width */}
              {!showNetwork && !showAlerts && null}
            </div>
          </div>

          {/* Right Column - Metrics, Services, Activity */}
          <div className="col-span-12 lg:col-span-4 space-y-2 sm:space-y-4">
            {/* Metrics Panel - only if prometheus enabled */}
            {showInfrastructure && (
              <MetricsPanel
                nodes={data.infrastructure.nodes}
                cluster={data.infrastructure.cluster}
              />
            )}

            {/* Service Health - ALWAYS shown */}
            <ServiceHealth serviceStatus={data.services} />

            {/* Activity Timeline - only if kubernetes enabled */}
            {showActivity && (
              <ActivityTimeline activity={data.activity} />
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border border-green-600 p-2 sm:p-3 mt-2 sm:mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 text-xs sm:text-sm text-green-600">
          <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
            {features.kubernetes && <span>K8S CLUSTER</span>}
            {features.prometheus && !features.kubernetes && <span>PROMETHEUS</span>}
            {!features.kubernetes && !features.prometheus && <span>SERVICE MONITOR</span>}
          </div>
          {data && features.kubernetes && (
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <span>{data.infrastructure.cluster.nodesReady}/{data.infrastructure.cluster.nodes} NODES</span>
              <span className="text-green-700">|</span>
              <span>{data.infrastructure.cluster.pods.running} PODS</span>
              <span className="hidden sm:inline text-green-700">|</span>
              <span className="hidden sm:inline">{data.infrastructure.cluster.namespaces} NS</span>
            </div>
          )}
          {data && !features.kubernetes && (
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <span>{data.services.upCount}/{data.services.totalCount} SERVICES UP</span>
              <span className="text-green-700">|</span>
              <span>{data.services.healthScore}% HEALTH</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  )
}

// Clock component that updates every second
function Clock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span>
      {time.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}
    </span>
  )
}

export default App
