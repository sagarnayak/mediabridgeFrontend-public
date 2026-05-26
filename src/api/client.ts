import axios from 'axios';
import { CONFIG } from '../config';

const BASE_URL = CONFIG.api.baseUrl;

const client = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// ── Token refresh queue ────────────────────────────────────────────────────
let isRefreshing = false;
let queue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  queue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  queue = [];
}

// ── Rate-limit circuit breaker ─────────────────────────────────────────────
// Normal mode: requests fire freely.
// Rate-limited mode: all requests queue; drain one-at-a-time with exponential
// back-off between items. Resets to normal after 5 s with no 429.
let rlActive = false;
let rlBackoffMs = 500;
const rlQueue: Array<() => void> = [];
let rlProcessing = false;
let rlTimer: ReturnType<typeof setTimeout> | null = null;

function rlBump() {
  rlActive = true;
  rlBackoffMs = Math.min(rlBackoffMs * 2, 30_000);
  if (rlTimer) clearTimeout(rlTimer);
  rlTimer = setTimeout(() => {
    rlActive = false;
    rlBackoffMs = 500;
    rlTimer = null;
    rlFlush();
  }, 5_000);
}

function rlFlush() {
  if (rlProcessing || rlQueue.length === 0) return;
  rlProcessing = true;
  rlQueue.shift()!();
}

function rlDone() {
  rlProcessing = false;
  setTimeout(rlFlush, rlActive ? rlBackoffMs : 0);
}
// ──────────────────────────────────────────────────────────────────────────

client.interceptors.request.use(async (config: any) => {
  const token = localStorage.getItem('mb_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (rlActive) {
    config._rlQueued = true;
    await new Promise<void>(resolve => rlQueue.push(resolve));
  }
  return config;
});

client.interceptors.response.use(
  (res) => {
    if ((res.config as any)._rlQueued) rlDone();
    return res;
  },
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;

    if (error.response?.status === 429 && (original._rlRetries ?? 0) < 6) {
      rlBump();
      original._rlRetries = (original._rlRetries ?? 0) + 1;
      original._rlQueued = true;
      await new Promise<void>(resolve => rlQueue.unshift(resolve));
      return client(original);
    }

    if (original?._rlQueued) rlDone();

    if (code === 'FORCE_LOGGED_OUT' || code === 'REFRESH_TOKEN_USED') {
      localStorage.removeItem('mb_token');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    if (code === 'TOKEN_EXPIRED' && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then((token) => {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });
        const newToken = res.data.token;
        localStorage.setItem('mb_token', newToken);
        processQueue(null, newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return client(original);
      } catch (err) {
        processQueue(err, null);
        localStorage.removeItem('mb_token');
        window.location.href = '/login';
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default client;
