import { useCallback, useRef, useState } from 'react';
import { CONFIG } from '../config';

export interface SearchResult {
  resource_name: string;
  prefix: string;
  full_path: string;
  type: 'file' | 'folder';
  file_size: number | null;
  uploaded_at: string | null;
}

interface UseSearchSocketReturn {
  results: SearchResult[];
  searching: boolean;
  currentFolder: string | null;
  isDone: boolean;
  search: (bucketId: string, q: string, prefix: string, scope: 'level' | 'full') => void;
  clear: () => void;
}

export function useSearchSocket(): UseSearchSocketReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    closeSocket();
    setResults([]);
    setSearching(false);
    setCurrentFolder(null);
    setIsDone(false);
  }, [closeSocket]);

  const search = useCallback((bucketId: string, q: string, prefix: string, scope: 'level' | 'full') => {
    closeSocket();
    setResults([]);
    setSearching(true);
    setCurrentFolder(null);
    setIsDone(false);

    const token = localStorage.getItem('mb_token') || '';
    const wsBase = CONFIG.api.baseUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsBase}/buckets/${bucketId}/search`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ token, q, prefix, scope }));
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case 'traversing':
        case 'cache_hit':
          setCurrentFolder(msg.folder as string);
          break;
        case 'result':
          setResults(prev => [...prev, {
            resource_name: msg.item.resource_name,
            prefix:        msg.item.prefix,
            full_path:     msg.item.full_path,
            type:          msg.item.type as 'file' | 'folder',
            file_size:     msg.item.file_size ?? null,
            uploaded_at:   msg.item.uploaded_at ? new Date(msg.item.uploaded_at).toISOString() : null,
          }]);
          break;
        case 'folder_done':
          setCurrentFolder(null);
          break;
        case 'complete':
          setSearching(false);
          setCurrentFolder(null);
          setIsDone(true);
          doneTimerRef.current = setTimeout(() => setIsDone(false), 3000);
          break;
        case 'error':
          setSearching(false);
          setCurrentFolder(null);
          if (msg.code === 'AUTH_REQUIRED' || msg.code === 'FORCE_LOGOUT') {
            window.location.href = '/login';
          }
          break;
      }
    };

    ws.onerror = () => {
      setSearching(false);
      setCurrentFolder(null);
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [closeSocket]);

  return { results, searching, currentFolder, isDone, search, clear };
}
