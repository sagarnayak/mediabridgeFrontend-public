import { useCallback, useRef, useState } from 'react';
import { CONFIG } from '../config';

type MinBucket = { id: string; display_name: string; root_path: string };

export interface GlobalSearchResult {
  resource_name:  string;
  prefix:         string;
  full_path:      string;
  type:           'file' | 'folder';
  file_size:      number | null;
  uploaded_at:    string | null;
  bucketId:       string;
  bucketName:     string;
  bucketRootPath: string;
}

export interface BucketState {
  name:          string;
  done:          boolean;
  failed:        boolean;
  currentFolder: string | null;
}

interface UseGlobalSearchReturn {
  results:      GlobalSearchResult[];
  searching:    boolean;
  isDone:       boolean;
  bucketsTotal: number;
  bucketsDone:  number;
  bucketStates: Record<string, BucketState>;
  search: (buckets: MinBucket[], q: string) => void;
  clear:  () => void;
}

export function useGlobalSearch(): UseGlobalSearchReturn {
  const [results, setResults]             = useState<GlobalSearchResult[]>([]);
  const [bucketsDone, setBucketsDone]     = useState(0);
  const [bucketsTotal, setBucketsTotal]   = useState(0);
  const [bucketStates, setBucketStates]   = useState<Record<string, BucketState>>({});
  const socketsRef    = useRef<WebSocket[]>([]);
  const generationRef = useRef(0);

  const close = useCallback(() => {
    socketsRef.current.forEach(ws => { try { ws.close(); } catch {} });
    socketsRef.current = [];
  }, []);

  const clear = useCallback(() => {
    generationRef.current++;
    close();
    setResults([]);
    setBucketsDone(0);
    setBucketsTotal(0);
    setBucketStates({});
  }, [close]);

  const search = useCallback((buckets: MinBucket[], q: string) => {
    close();
    const gen = ++generationRef.current;
    setResults([]);
    setBucketsDone(0);
    setBucketsTotal(buckets.length);

    const initial: Record<string, BucketState> = {};
    for (const b of buckets) initial[b.id] = { name: b.display_name, done: false, failed: false, currentFolder: null };
    setBucketStates(initial);

    if (buckets.length === 0) return;

    const token = localStorage.getItem('mb_token') || '';
    const wsBase = CONFIG.api.baseUrl.replace(/^http/, 'ws');

    for (const bucket of buckets) {
      const ws = new WebSocket(`${wsBase}/buckets/${bucket.id}/search`);
      socketsRef.current.push(ws);

      let settled = false;

      const markDone = (failed: boolean) => {
        if (settled || generationRef.current !== gen) return;
        settled = true;
        setBucketsDone(prev => prev + 1);
        setBucketStates(prev => ({
          ...prev,
          [bucket.id]: { ...prev[bucket.id], done: true, failed, currentFolder: null },
        }));
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ token, q, prefix: '', scope: 'full' }));
      };

      ws.onmessage = (event: MessageEvent) => {
        if (generationRef.current !== gen) return;
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { return; }

        if (msg.type === 'traversing' || msg.type === 'cache_hit') {
          setBucketStates(prev => ({ ...prev, [bucket.id]: { ...prev[bucket.id], currentFolder: msg.folder as string } }));
        } else if (msg.type === 'result') {
          setResults(prev => [...prev, {
            resource_name:  msg.item.resource_name,
            prefix:         msg.item.prefix,
            full_path:      msg.item.full_path,
            type:           msg.item.type as 'file' | 'folder',
            file_size:      msg.item.file_size  ?? null,
            uploaded_at:    msg.item.uploaded_at ?? null,
            bucketId:       bucket.id,
            bucketName:     bucket.display_name,
            bucketRootPath: bucket.root_path || '',
          }]);
        } else if (msg.type === 'complete') {
          markDone(false);
        } else if (msg.type === 'error') {
          markDone(true);
        }
      };

      ws.onerror = () => markDone(true);
      ws.onclose = () => markDone(true);  // if complete already fired, settled=true guards this
    }
  }, [close]);

  const searching = bucketsTotal > 0 && bucketsDone < bucketsTotal;
  const isDone    = bucketsTotal > 0 && bucketsDone >= bucketsTotal;

  return { results, searching, isDone, bucketsTotal, bucketsDone, bucketStates, search, clear };
}
