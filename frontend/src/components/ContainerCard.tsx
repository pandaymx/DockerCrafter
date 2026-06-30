// src/components/ContainerCard.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, RefreshCw, Terminal } from 'lucide-react';
import type { ContainerInfo } from '../types';
import { formatBytes } from '../utils/format';

interface ContainerCardProps {
  container: ContainerInfo;
  onStart?: (id: string, name: string) => void;
  onStop?: (id: string, name: string) => void;
  onRestart?: (id: string, name: string) => void;
  onLogs?: (id: string, name: string) => void;
}

export const ContainerCard: React.FC<ContainerCardProps> = ({
  container,
  onStart,
  onStop,
  onRestart,
  onLogs,
}) => {
  const { t } = useTranslation();
  const isRunning = container.state === 'running';

  // Dynamic performance bar colors
  const cpuColor = container.cpuUsage > 80 ? 'bg-rose-500' : container.cpuUsage > 40 ? 'bg-amber-500' : 'bg-cyan-500';
  const memMaxMock = 2 * 1024 * 1024 * 1024; // 2GB assumed limit for visualization
  const memPercentage = Math.min((container.memoryUsage / memMaxMock) * 100, 100);
  const memColor = memPercentage > 80 ? 'bg-rose-500' : memPercentage > 40 ? 'bg-amber-500' : 'bg-purple-500';

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/50 transition-all duration-200 shadow-lg backdrop-blur-sm flex flex-col justify-between">
      <div>
        {/* Header: Name, State light, Action buttons */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <h4 className="font-mono font-bold text-slate-200 text-sm truncate max-w-[150px] sm:max-w-[180px]" title={container.name}>
              {container.name}
            </h4>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">({container.state})</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
            {isRunning ? (
              <button
                onClick={() => onStop?.(container.id, container.name)}
                title={t('container.stop')}
                className="p-1 hover:text-rose-400 hover:bg-slate-700 rounded transition"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => onStart?.(container.id, container.name)}
                title={t('container.start')}
                className="p-1 hover:text-emerald-400 hover:bg-slate-700 rounded transition"
              >
                <Play className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => onRestart?.(container.id, container.name)}
              title={t('container.restart')}
              className="p-1 hover:text-emerald-400 hover:bg-slate-700 rounded transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => onLogs?.(container.id, container.name)}
              title={t('container.logs')}
              className="p-1 hover:text-blue-400 hover:bg-slate-700 rounded transition"
            >
              <Terminal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Real-time stats */}
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs font-mono">
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/30 flex flex-col justify-between">
            <div>
              <div className="text-slate-400 mb-0.5 text-[10px]">CPU</div>
              <div className="text-slate-100 font-bold text-sm">
                {isRunning ? `${container.cpuUsage.toFixed(1)}%` : '0.0%'}
              </div>
            </div>
            {isRunning && (
              <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden mt-1.5">
                <div className={`${cpuColor} h-full transition-all duration-300`} style={{ width: `${Math.min(container.cpuUsage, 100)}%` }} />
              </div>
            )}
          </div>
          
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/30 flex flex-col justify-between">
            <div>
              <div className="text-slate-400 mb-0.5 text-[10px]">MEM</div>
              <div className="text-slate-100 font-bold text-sm">
                {isRunning ? formatBytes(container.memoryUsage) : '0 B'}
              </div>
            </div>
            {isRunning && (
              <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden mt-1.5">
                <div className={`${memColor} h-full transition-all duration-300`} style={{ width: `${memPercentage}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Internal details like Status & Image */}
      <div className="mb-3 text-[11px] font-mono text-slate-400 border-t border-slate-700/20 pt-2 space-y-0.5">
        <div className="truncate"><span className="text-slate-500">{t('container.image')}:</span> {container.image}</div>
        <div><span className="text-slate-500">{t('container.status')}:</span> {container.status}</div>
      </div>

      {/* Port forwards */}
      {container.ports && container.ports.length > 0 ? (
        <div className="space-y-1.5">
          {container.ports.map((portStr) => {
            const parts = portStr.split(':');
            const publicPort = parts[0];
            const privatePort = parts[1] || parts[0];
            return (
              <a
                key={portStr}
                href={`http://localhost:${publicPort}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between bg-blue-950/30 hover:bg-blue-900/40 border border-blue-900/50 rounded-lg px-3 py-1.5 text-xs text-blue-400 transition"
              >
                <span>{privatePort} ({t('container.internalPort')})</span>
                <span className="flex items-center gap-1 text-[11px] text-blue-300 font-semibold">
                  ➜ localhost:{publicPort}
                </span>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="text-center text-[10px] text-slate-500 font-mono py-1.5 bg-slate-900/20 border border-dashed border-slate-700/20 rounded-lg">
          {t('container.noPorts')}
        </div>
      )}
    </div>
  );
};
