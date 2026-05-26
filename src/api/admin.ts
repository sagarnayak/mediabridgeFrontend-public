import client from './client';

// Buckets
export const getBuckets = () => client.get('/admin/buckets').then(r => r.data);
export const createBucket = (data: any) => client.post('/admin/buckets', data).then(r => r.data);
export const deleteBucket = (id: string) => client.delete(`/admin/buckets/${id}`).then(r => r.data);

// Users
export const getUsers = () => client.get('/admin/users').then(r => r.data);
export const createUser = (data: any) => client.post('/admin/users', data).then(r => r.data);
export const deleteUser = (id: string) => client.delete(`/admin/users/${id}`).then(r => r.data);

// Assignments
export const getAssignments = () => client.get('/admin/assignments').then(r => r.data);
export const createAssignment = (userId: string, bucketId: string, allowDelete: boolean) =>
  client.post('/admin/assign', { userId, bucketId, allowDelete }).then(r => r.data);
export const updateAssignment = (userId: string, bucketId: string, allowDelete: boolean) =>
  client.patch('/admin/assign', { userId, bucketId, allowDelete }).then(r => r.data);
export const deleteAssignment = (userId: string, bucketId: string) =>
  client.delete('/admin/assign', { data: { userId, bucketId } }).then(r => r.data);

// Cache
export const flushCache = () => client.delete('/admin/cache').then(r => r.data);

// Audit log
export const getAuditLog = (limit: number, offset: number, operation?: string) =>
  client.get('/admin/audit', { params: { limit, offset, ...(operation ? { operation } : {}) } }).then(r => r.data);

// AWS key → user mapping
export const getAwsKeys = () => client.get('/admin/aws-keys').then(r => r.data);
export const createAwsKey = (data: { accessKeyId: string; email: string; ownerName?: string; notes?: string }) =>
  client.post('/admin/aws-keys', data).then(r => r.data);
export const deleteAwsKey = (id: string) => client.delete(`/admin/aws-keys/${id}`).then(r => r.data);

// Restore requests
export const getRestoreRequests = (limit: number, offset: number) =>
  client.get('/admin/restore-requests', { params: { limit, offset } }).then(r => r.data);
