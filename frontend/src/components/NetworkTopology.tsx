import { NetworkStatus } from '../types';

interface Props {
  network: NetworkStatus;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRate(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} Gbps`;
  } else if (mbps >= 1) {
    return `${mbps.toFixed(1)} Mbps`;
  } else if (mbps > 0) {
    return `${(mbps * 1000).toFixed(0)} Kbps`;
  }
  return '0 Kbps';
}

export default function NetworkTopology({ network }: Props) {
  const { firewall, interfaces, dhcpLeases, deviceCount, available } = network;

  if (!available) {
    return (
      <div className="border border-terminal-dim rounded-lg p-4">
        <h2 className="text-terminal-green font-bold mb-4 text-lg">
          [ NETWORK TOPOLOGY ]
        </h2>
        <div className="text-terminal-dim text-center py-8">
          <span className="text-yellow-500">OFFLINE</span> - Fortigate API unavailable
        </div>
      </div>
    );
  }

  const statusColor = firewall.status === 'online' ? 'text-terminal-green' :
                      firewall.status === 'error' ? 'text-red-500' : 'text-yellow-500';

  return (
    <div className="border border-terminal-dim rounded-lg p-4">
      <h2 className="text-terminal-green font-bold mb-4 text-lg">
        [ NETWORK TOPOLOGY ]
      </h2>

      {/* Firewall Status */}
      <div className="mb-4 p-3 bg-terminal-bg border border-terminal-dim rounded">
        <div className="flex items-center justify-between mb-2">
          <span className="text-terminal-green font-bold">{firewall.hostname}</span>
          <span className={`${statusColor} uppercase text-sm`}>{firewall.status}</span>
        </div>
        <div className="text-xs text-terminal-dim mb-2">
          {firewall.model} | {firewall.firmware}
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <span className="text-terminal-dim">CPU:</span>{' '}
            <span className={firewall.cpu > 80 ? 'text-red-500' : firewall.cpu > 60 ? 'text-yellow-500' : 'text-terminal-green'}>
              {firewall.cpu}%
            </span>
          </div>
          <div>
            <span className="text-terminal-dim">MEM:</span>{' '}
            <span className={firewall.memory > 80 ? 'text-red-500' : firewall.memory > 60 ? 'text-yellow-500' : 'text-terminal-green'}>
              {firewall.memory}%
            </span>
          </div>
          <div>
            <span className="text-terminal-dim">UP:</span>{' '}
            <span className="text-terminal-green">{firewall.uptimeFormatted || 'Unknown'}</span>
          </div>
        </div>
      </div>

      {/* Network Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-2 bg-terminal-bg border border-terminal-dim rounded text-center">
          <div className="text-2xl text-terminal-green font-bold">{deviceCount}</div>
          <div className="text-xs text-terminal-dim">DEVICES</div>
        </div>
        <div className="p-2 bg-terminal-bg border border-terminal-dim rounded text-center">
          <div className="text-2xl text-terminal-green font-bold">{dhcpLeases}</div>
          <div className="text-xs text-terminal-dim">DHCP LEASES</div>
        </div>
      </div>

      {/* Interfaces */}
      <div className="space-y-2">
        <div className="text-xs text-terminal-dim uppercase tracking-wide mb-1">Interfaces</div>
        {interfaces.length === 0 ? (
          <div className="text-terminal-dim text-sm">No interfaces available</div>
        ) : (
          interfaces.map((iface) => (
            <div
              key={iface.name}
              className="p-2 bg-terminal-bg border border-terminal-dim rounded text-sm"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${iface.status === 'up' ? 'bg-terminal-green' : 'bg-red-500'}`} />
                  <span className="text-terminal-green font-mono">{iface.name}</span>
                  {iface.ip && iface.ip !== '0.0.0.0' && (
                    <span className="text-terminal-dim text-xs">{iface.ip}</span>
                  )}
                </div>
                {iface.speed > 0 && (
                  <span className="text-xs text-terminal-dim">
                    {iface.speed >= 1000 ? `${iface.speed / 1000}G` : `${iface.speed}M`}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-blue-400">
                    RX: {formatRate(iface.rxRate || 0)}
                  </span>
                  <span className="text-purple-400">
                    TX: {formatRate(iface.txRate || 0)}
                  </span>
                </div>
                <div className="text-terminal-dim">
                  {formatBytes(iface.rxBytes)} / {formatBytes(iface.txBytes)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
