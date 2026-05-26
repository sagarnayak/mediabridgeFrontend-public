export const CONFIG = {
  pagination: {
    pageSize: 20,
  },
  upload: {
    maxFileSizeBytes: 26214400, // 25MB
    maxFileSizeMB: 25,
  },
  search: {
    minChars: 3,
    debounceMs: 400,
  },
  api: {
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  },
} as const;
