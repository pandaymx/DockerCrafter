import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface LogsModalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

interface LogFragment {
  type: string;
  data: string;
}

export const LogsModal: React.FC<LogsModalProps> = ({ containerId, containerName, onClose }) => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogFragment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: number;
    let retryCount = 0;
    let isMounted = true;
    const maxRetries = 5;

    const connectWS = () => {
      if (ws) ws.close();
      setLoading(true);
      setLogs([]); // Clear logs before reconnecting to prevent duplicating trailing logs

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/containers/logs/ws?id=${containerId}&tail=100`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError(err.message || t('logsModal.fetchError'));
      } finally {
        setLoading(false);
        retryCount = 0; // Reset retries on successful connection
      };

      ws.onmessage = (event) => {
        let newFragment: LogFragment;
        try {
          const parsed = JSON.parse(event.data);
          newFragment = {
            type: parsed.type || 'stdout',
            data: parsed.data || '',
          };
        } catch {
          // Fallback for non-JSON strings (e.g. legacy backend or errors)
          newFragment = {
            type: 'stdout',
            data: event.data,
          };
        }

        setLogs((prev) => {
          if (prev.length === 0) return [newFragment];
          const last = prev[prev.length - 1];
          if (last.type === newFragment.type) {
            // Merge chunks to reduce DOM size and rendering load
            return [
              ...prev.slice(0, prev.length - 1),
              { type: last.type, data: last.data + newFragment.data },
            ];
          }
          return [...prev, newFragment];
        });
      };

      ws.onerror = () => {
        setError(t('logsModal.fetchError') || 'WebSocket connection error');
        setLoading(false);
      };

      ws.onclose = (event) => {
        if (!isMounted || event.wasClean) return;

        // Exponential backoff reconnect
        if (retryCount < maxRetries) {
          const timeout = Math.min(1000 * Math.pow(2, retryCount), 10000);
          console.log(`WebSocket closed, retrying in ${timeout}ms...`);
          reconnectTimeout = window.setTimeout(() => {
            retryCount++;
            connectWS();
          }, timeout);
        } else {
          setError('Connection lost. Max retries reached.');
          setLoading(false);
        }
      };
    };

    // Initial fetch
    fetchLogs();

    // Set up polling every 3 seconds
    const intervalId = setInterval(fetchLogs, 3000);

    return () => clearInterval(intervalId);
  }, [containerId, t]);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-4xl max-h-full bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-mono font-bold text-zinc-100">
              {t('logsModal.title', { name: containerName })}
            </h2>
            {loading && (
              <span className="text-xs text-cyan-400 animate-pulse font-mono flex items-center gap-1">
                <svg width="12" height="12" className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('logsModal.refreshing')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-mono text-zinc-400 cursor-pointer hover:text-zinc-300">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-zinc-900"
              />
              {t('logsModal.autoScroll')}
            </label>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-rose-400 transition-colors p-1"
              title={t('logsModal.close')}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Logs Container */}
        <div className="relative flex-1 overflow-y-auto p-4 bg-zinc-950 max-h-[60vh] min-h-[40vh]">
          {error ? (
            <div className="text-rose-500 font-mono text-sm">{error}</div>
          ) : logs.length > 0 ? (
            <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
              {logs.map((frag, idx) => (
                <span key={idx} className={frag.type === 'stderr' ? 'text-rose-400' : 'text-zinc-300'}>
                  {frag.data}
                </span>
              ))}
              <div ref={logEndRef} />
            </pre>
          ) : (
            <div className="text-zinc-600 font-mono text-sm italic">
              {loading ? '' : t('logsModal.empty')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
