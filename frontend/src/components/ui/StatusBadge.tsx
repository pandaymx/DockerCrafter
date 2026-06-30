import React from 'react';
import { cn } from '../../utils/cn';

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: 'running' | 'stopped' | 'exited' | 'error' | 'unknown';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  className,
  children,
  showDot = true,
  ...props
}) => {
  const isRunning = status === 'running';

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono border",
        {
          'bg-emerald-950/30 text-emerald-400 border-emerald-900/50': isRunning,
          'bg-rose-950/30 text-rose-400 border-rose-900/50': status === 'stopped' || status === 'exited',
          'bg-red-950/30 text-red-400 border-red-900/50': status === 'error',
          'bg-slate-800 text-slate-400 border-slate-700/50': status === 'unknown',
        },
        className
      )}
      {...props}
    >
      {showDot && (
        <span
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            {
              'bg-emerald-500 animate-pulse': isRunning,
              'bg-rose-500': status === 'stopped' || status === 'exited',
              'bg-red-500': status === 'error',
              'bg-slate-500': status === 'unknown',
            }
          )}
        />
      )}
      {children}
    </div>
  );
};
