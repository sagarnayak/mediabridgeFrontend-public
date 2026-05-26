import client from './client';

export const checkSetupStatus = () =>
  client.get('/auth/setup-status').then((r) => r.data);

export const setupMasterAdmin = (data: { name: string; email: string; password: string }) =>
  client.post('/auth/setup', data).then((r) => r.data);

export const login = (email: string, password: string) =>
  client.post('/auth/login', { email, password }).then((r) => r.data);

export const logout = () =>
  client.post('/auth/logout').then((r) => r.data);

export const getMe = () =>
  client.get('/auth/me').then((r) => r.data);
