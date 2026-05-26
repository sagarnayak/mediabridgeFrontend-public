import client from './client';

export const getAccessibleBuckets = () => client.get('/buckets').then(r => r.data);

export const getFiles = (bucketId: string, prefix: string, limit: number, offset: number) =>
  client.get(`/buckets/${bucketId}/files`, { params: { prefix, limit, offset } }).then(r => r.data);

export const presignFiles = (files: Array<{
  bucketId: string; path: string; filename: string; size: number; contentType: string;
}>) => client.post('/upload/presign', files).then(r => r.data);

export const getFileUrls = (bucketId: string, keys: string[]): Promise<Record<string, { file_url: string; thumbnail_url: string | null }>> =>
  client.post(`/buckets/${bucketId}/urls`, { keys }).then(r => r.data);

export const deleteFile = (bucketId: string, s3Key: string) =>
  client.delete(`/buckets/${bucketId}/files`, { data: { s3Key } }).then(r => r.data);

// Queue so we don't fire 100+ simultaneous requests when a large folder loads.
const thumbQueue: Array<() => void> = [];
let thumbActive = 0;
const THUMB_CONCURRENCY = 1;

function drainThumbQueue() {
  while (thumbActive < THUMB_CONCURRENCY && thumbQueue.length > 0) {
    thumbActive++;
    thumbQueue.shift()!();
  }
}

// sessionStorage deduplication — only marked on success so failures retry next visit.
export const generateThumbnail = (bucketId: string, key: string, onRateLimited?: () => void): void => {
  const storageKey = `thumb_req:${bucketId}:${key}`;
  if (sessionStorage.getItem(storageKey)) return;
  thumbQueue.push(() => {
    client.post('/thumbnails/generate', { bucket_id: bucketId, key })
      .then(() => sessionStorage.setItem(storageKey, '1'))
      .catch((err: any) => {
        if (err?.response?.status === 429 && onRateLimited) onRateLimited();
      })
      .finally(() => { thumbActive--; drainThumbQueue(); });
  });
  drainThumbQueue();
};
