// src/components/ContainerCard.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ContainerInfo } from '../types';
import { formatBytes } from '../utils/format';
import { Button, StatusBadge, ProgressBar } from './ui';
import { Play, Square, RefreshCw, Terminal, SquareTerminal } from 'lucide-react';

interface ContainerCardProps {
  container: ContainerInfo;
  onStart?: (id: string, name: string) => void;
  onStop?: (id: string, name: string) => void;
  onRestart?: (id: string, name: string) => void;
  onLogs?: (id: string, name: string) => void;
  onTerminal?: (id: string, name: string) => void;
}

export const ContainerCard: React.FC<ContainerCardProps> = ({
  container,
  onStart,
  onStop,
  onRestart,
  onLogs,
  onTerminal,
}) => {
  const { t } = useTranslation();
  const isRunning = container.state === 'running';

  // Dynamic performance bar colors
  const memMaxMock = 2 * 1024 * 1024 * 1024; // 2GB assumed limit for visualization
  const cpuColor = container.cpuUsage > 80 ? 'bg-rose-500' : container.cpuUsage > 40 ? 'bg-amber-500' : 'bg-cyan-500';

  // Use memoryLimit if valid, fallback to 2GB for visualization if 0
  const memLimit = container.memoryLimit > 0 ? container.memoryLimit : 2 * 1024 * 1024 * 1024;
  const memPercentage = Math.min((container.memoryUsage / memLimit) * 100, 100);
  const memColor = memPercentage > 80 ? 'bg-rose-500' : memPercentage > 40 ? 'bg-amber-500' : 'bg-purple-500';

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:border-blue-500/50 transition-all duration-200 shadow-lg backdrop-blur-sm flex flex-col justify-between">
      <div>
        {/* Header: Name, State light, Action buttons */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <StatusBadge status={container.state as any} showDot className="px-0 py-0 border-none bg-transparent">
              <h4 className="font-mono font-bold text-slate-200 text-sm truncate max-w-[150px] sm:max-w-[180px] ml-1" title={container.name}>
                {container.name}
              </h4>
            </StatusBadge>
            <span className="text-[11px] text-slate-400 font-mono shrink-0">({container.state})</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isRunning ? (
              <Button
                variant="icon"
                size="icon"
                onClick={() => onStop?.(container.id, container.name)}
                title={t('container.stop')}
                className="hover:text-rose-400"
              >
                <Square className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="icon"
                size="icon"
                onClick={() => onStart?.(container.id, container.name)}
                title={t('container.start')}
                className="hover:text-emerald-400"
              >
                <Play className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="icon"
              size="icon"
              onClick={() => onRestart?.(container.id, container.name)}
              title={t('container.restart')}
              className="hover:text-emerald-400"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="icon"
              size="icon"
              onClick={() => onLogs?.(container.id, container.name)}
              title={t('container.logs')}
              className="hover:text-blue-400"
            >
              <Terminal className="w-4 h-4" />
            </Button>
            </button>
            <button
              onClick={() => onTerminal?.(container.id, container.name)}
              title={t('container.terminal', { defaultValue: 'Terminal' })}
              className="p-1 hover:text-purple-400 hover:bg-slate-700 rounded transition"
            >
              <SquareTerminal className="w-4 h-4" />
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
              <ProgressBar value={container.cpuUsage} max={100} colorType="cpu" className="mt-1.5 h-1" />
            )}
          </div>
          
          <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-700/30 flex flex-col justify-between">
            <div>
              <div className="text-slate-400 mb-0.5 text-[10px]">MEM</div>
              <div className="text-slate-100 font-bold text-sm">
                {isRunning ? (
                  <span>
                    {formatBytes(container.memoryUsage)} <span className="text-slate-500 font-normal text-xs">/ {formatBytes(memLimit)}</span>
                  </span>
                ) : '0 B'}
              </div>
            </div>
            {isRunning && (
              <ProgressBar value={container.memoryUsage} max={memMaxMock} colorType="memory" className="mt-1.5 h-1" />
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
