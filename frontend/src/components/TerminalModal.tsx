import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface TerminalModalProps {
  containerId: string;
  containerName: string;
  onClose: () => void;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({ containerId, containerName, onClose }) => {
  const { t } = useTranslation();
  const terminalRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let ws: WebSocket;
    let isMounted = true;

    if (!terminalRef.current) return;

    // Initialize xterm.js
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#09090b', // zinc-950
        foreground: '#d4d4d8', // zinc-300
        cursor: '#22d3ee', // cyan-400
      },
      fontFamily: 'monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    const connectWS = () => {
      if (ws) ws.close();
      setLoading(true);

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/containers/exec/ws?id=${containerId}`;

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        if (!isMounted) return;
        setError(null);
        setLoading(false);
        // Send initial resize
        const { cols, rows } = term;
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        if (typeof event.data === 'string') {
          term.write(event.data);
        } else {
          term.write(new Uint8Array(event.data));
        }
      };

      ws.onerror = () => {
        if (!isMounted) return;
        setError(t('terminalModal.fetchError') || 'WebSocket connection error');
        setLoading(false);
      };

      ws.onclose = (event) => {
        if (!isMounted) return;
        if (!event.wasClean) {
          setError(t('terminalModal.disconnected', { defaultValue: 'Disconnected' }));
        } else {
          term.write('\r\n\x1b[33m[Disconnected]\x1b[0m\r\n');
        }
        setLoading(false);
      };

      // Handle user input
      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      // Handle resize
      term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    };

    connectWS();

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', handleResize);
      if (ws) {
        ws.close();
      }
      term.dispose();
    };
  }, [containerId, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="flex flex-col w-full max-w-5xl h-[80vh] bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-mono font-bold text-zinc-100">
              {t('terminalModal.title', { name: containerName, defaultValue: `Terminal - ${containerName}` })}
            </h2>
            {loading && (
              <span className="text-xs text-cyan-400 animate-pulse font-mono flex items-center gap-1">
                <svg width="12" height="12" className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('terminalModal.connecting', { defaultValue: 'Connecting...' })}
              </span>
            )}
            {error && (
              <span className="text-xs text-rose-500 font-mono flex items-center gap-1">
                {error === 'terminalModal.disconnected' ? 'Disconnected' : error}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-rose-400 transition-colors p-1"
              title={t('terminalModal.close', { defaultValue: 'Close' })}
            >
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l18 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Terminal Container */}
        <div className="flex-1 overflow-hidden p-4 bg-zinc-950">
          <div ref={terminalRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
};
