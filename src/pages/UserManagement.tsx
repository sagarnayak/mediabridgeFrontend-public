import { useEffect, useRef, useState } from 'react';
import {
  getBuckets, createBucket, deleteBucket,
  getUsers, createUser, deleteUser,
  getAssignments, createAssignment, updateAssignment, deleteAssignment,
  flushCache, getAuditLog,
  getAwsKeys, createAwsKey, deleteAwsKey,
  getRestoreRequests,
} from '../api/admin';

type Tab = 'buckets' | 'users' | 'assignments' | 'audit' | 'aws-keys' | 'restores';

const TAB_LABELS: Record<Tab, string> = {
  buckets: 'Buckets',
  users: 'Users',
  assignments: 'Assignments',
  audit: 'Audit',
  'aws-keys': 'AWS Keys',
  restores: 'Restores',
};

export default function UserManagement() {
  const [tab, setTab] = useState<Tab>('buckets');

  return (
    <div style={s.container}>
      <div style={s.tabs}>
        {(['buckets', 'users', 'assignments', 'audit', 'aws-keys', 'restores'] as Tab[]).map(t => (
          <button
            key={t}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div style={s.tabContent}>
        {tab === 'buckets' && <BucketsTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'assignments' && <AssignmentsTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'aws-keys' && <AwsKeysTab />}
        {tab === 'restores' && <RestoresTab />}
      </div>
    </div>
  );
}

// ─── BUCKETS TAB ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function toSystemCode(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function BucketsTab() {
  const [buckets, setBuckets] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ displayName: '', description: '', bucketName: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '', cloudfrontBaseUrl: '', rootPath: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [flushMsg, setFlushMsg] = useState('');

  const systemCode = toSystemCode(form.displayName);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setBuckets(await getBuckets()); } catch {}
  }

  async function handleFlushCache() {
    if (!confirm('Clear all caches (file metadata, URLs, folder index)? Users will fetch fresh data from S3 on next browse or search.')) return;
    setFlushing(true);
    setFlushMsg('');
    try {
      const res = await flushCache();
      const { resource_cache, url_cache, folder_index } = res.deleted;
      setFlushMsg(`Cache cleared — metadata: ${resource_cache}, URLs: ${url_cache}, folder index: ${folder_index} rows removed.`);
      setTimeout(() => setFlushMsg(''), 4000);
    } catch {
      setFlushMsg('Failed to flush cache.');
      setTimeout(() => setFlushMsg(''), 4000);
    } finally {
      setFlushing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createBucket({ ...form, systemCode });
      setForm({ displayName: '', description: '', bucketName: '', region: 'us-east-1', accessKeyId: '', secretAccessKey: '', cloudfrontBaseUrl: '', rootPath: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create bucket');
    } finally { setLoading(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove bucket "${name}"? This will also remove all user assignments.`)) return;
    try { await deleteBucket(id); load(); } catch {}
  }

  return (
    <div>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>S3 Buckets</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {flushMsg && <span style={{ fontSize: '13px', color: flushMsg.startsWith('Failed') ? '#DC2626' : '#16A34A' }}>{flushMsg}</span>}
          <button style={{ ...s.btnDanger, padding: '9px 16px', fontSize: '13px' }} onClick={handleFlushCache} disabled={flushing}>
            {flushing ? 'Flushing...' : 'Flush Cache'}
          </button>
          <button style={s.btnPrimary} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add Bucket'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formGrid}>
            <div>
              <Field label="Display Name *" value={form.displayName} onChange={v => setForm({ ...form, displayName: v })} placeholder="My Media Bucket" />
              {form.displayName && <div style={s.systemCodePreview}><span>Code:</span><span style={s.systemCodeBadge}>{systemCode}</span></div>}
            </div>
            <Field label="S3 Bucket Name *" value={form.bucketName} onChange={v => setForm({ ...form, bucketName: v })} placeholder="my-s3-bucket-name" />
            <Field label="Region *" value={form.region} onChange={v => setForm({ ...form, region: v })} placeholder="us-east-1" />
            <Field label="Access Key ID *" value={form.accessKeyId} onChange={v => setForm({ ...form, accessKeyId: v })} placeholder="AKIA..." />
            <Field label="Secret Access Key *" value={form.secretAccessKey} onChange={v => setForm({ ...form, secretAccessKey: v })} placeholder="••••••••" type="password" />
            <Field label="CloudFront Base URL (optional, leave blank for private bucket)" value={form.cloudfrontBaseUrl} onChange={v => setForm({ ...form, cloudfrontBaseUrl: v })} placeholder="https://cdn.yourdomain.com" />
            <Field label="Root Path" value={form.rootPath} onChange={v => setForm({ ...form, rootPath: v })} placeholder="optional/folder/path/" />
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Description" value={form.description} onChange={v => setForm({ ...form, description: v })} placeholder="Optional description" />
            </div>
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Bucket'}
          </button>
        </form>
      )}

      <div style={s.table}>
        <div style={{ ...s.tableRow, ...s.bucketsRow, ...s.tableHeader }}>
          <span>Name</span><span>Bucket</span><span>Region</span><span>Files</span><span>Size</span><span>CloudFront</span><span></span>
        </div>
        {buckets.length === 0 && <p style={s.empty}>No buckets added yet.</p>}
        {buckets.map(b => (
          <div key={b.id} style={{ ...s.tableRow, ...s.bucketsRow }}>
            <div>
              <p style={{ margin: '0 0 2px 0', fontWeight: 600, color: '#1E293B', fontSize: '14px' }}>{b.display_name}</p>
              {b.description && <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#64748B' }}>{b.description}</p>}
              <span style={s.code}>{b.system_code}</span>
            </div>
            <span style={{ ...s.muted, fontSize: '12px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{b.bucket_name}</span>
            <span style={s.muted}>{b.region}</span>
            <span style={s.muted}>{b.file_count != null ? Number(b.file_count).toLocaleString() : '—'}</span>
            <span style={s.muted}>{b.total_size != null ? formatBytes(Number(b.total_size)) : '—'}</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {b.cloudfront_base_url
                ? <span style={{ ...s.muted, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{b.cloudfront_base_url}</span>
                : <span style={{ ...s.badge, ...s.badgeGray }}>Private</span>
              }
            </div>
            <button style={s.btnDanger} onClick={() => handleDelete(b.id, b.display_name)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── USERS TAB ───────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', isAdmin: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setUsers(await getUsers()); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createUser(form);
      setForm({ name: '', email: '', password: '', isAdmin: false });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user');
    } finally { setLoading(false); }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete user "${name}"?`)) return;
    try { await deleteUser(id); load(); } catch {}
  }

  return (
    <div>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>Users</h2>
        <button style={s.btnPrimary} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formGrid}>
            <Field label="Full Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Jane Doe" />
            <Field label="Email *" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="jane@example.com" type="email" />
            <Field label="Password *" value={form.password} onChange={v => setForm({ ...form, password: v })} placeholder="Min. 8 characters" type="password" />
            <div style={s.checkboxField}>
              <input type="checkbox" id="isAdmin" checked={form.isAdmin} onChange={e => setForm({ ...form, isAdmin: e.target.checked })} />
              <label htmlFor="isAdmin" style={s.checkboxLabel}>Admin user</label>
            </div>
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save User'}
          </button>
        </form>
      )}

      <div style={s.table}>
        <div style={{ ...s.tableRow, ...s.usersRow, ...s.tableHeader }}>
          <span>Name</span><span>Email</span><span>Role</span><span>Created</span><span></span>
        </div>
        {users.length === 0 && <p style={s.empty}>No users yet.</p>}
        {users.map(u => (
          <div key={u.id} style={{ ...s.tableRow, ...s.usersRow }}>
            <span style={s.bold}>{u.name}</span>
            <span style={s.muted}>{u.email}</span>
            <span>
              <span style={{ ...s.badge, ...(u.is_admin ? s.badgeBlue : s.badgeGray) }}>
                {u.is_admin ? 'Admin' : 'User'}
              </span>
            </span>
            <span style={s.muted}>{new Date(u.created_at).toLocaleDateString()}</span>
            <button style={s.btnDanger} onClick={() => handleDelete(u.id, u.name)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ASSIGNMENTS TAB ─────────────────────────────────────────────────────────

function AssignmentsTab() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [buckets, setBuckets] = useState<any[]>([]);
  const [form, setForm] = useState({ userId: '', bucketId: '', allowDelete: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [a, u, b] = await Promise.all([getAssignments(), getUsers(), getBuckets()]);
      setAssignments(a);
      setUsers(u);
      setBuckets(b);
    } catch {}
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createAssignment(form.userId, form.bucketId, form.allowDelete);
      setForm({ userId: '', bucketId: '', allowDelete: false });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to assign');
    } finally { setLoading(false); }
  }

  async function handleRemove(userId: string, bucketId: string, userName: string, bucketName: string) {
    if (!confirm(`Remove "${userName}" from "${bucketName}"?`)) return;
    try { await deleteAssignment(userId, bucketId); load(); } catch {}
  }

  return (
    <div>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>Assignments</h2>
      </div>

      <form onSubmit={handleAssign} style={{ ...s.form, marginBottom: '24px' }}>
        <div style={s.assignRow}>
          <select style={s.select} value={form.userId} onChange={e => setForm({ ...form, userId: e.target.value })} required>
            <option value="">Select user...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
          <span style={s.arrow}>→</span>
          <select style={s.select} value={form.bucketId} onChange={e => setForm({ ...form, bucketId: e.target.value })} required>
            <option value="">Select bucket...</option>
            {buckets.map(b => <option key={b.id} value={b.id}>{b.display_name}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <input type="checkbox" id="allowDelete" checked={form.allowDelete} onChange={e => setForm({ ...form, allowDelete: e.target.checked })} />
            <label htmlFor="allowDelete" style={s.checkboxLabel}>Allow delete</label>
          </div>
          <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Assigning...' : 'Assign'}
          </button>
        </div>
        {error && <p style={s.error}>{error}</p>}
      </form>

      <div style={s.table}>
        <div style={{ ...s.tableRow, ...s.assignmentsRow, ...s.tableHeader }}>
          <span>User</span><span>Email</span><span>Bucket</span><span>Assigned</span><span>Can Delete</span><span></span>
        </div>
        {assignments.length === 0 && <p style={s.empty}>No assignments yet.</p>}
        {assignments.map(a => (
          <div key={`${a.user_id}-${a.bucket_id}`} style={{ ...s.tableRow, ...s.assignmentsRow }}>
            <span style={s.bold}>{a.user_name}</span>
            <span style={s.muted}>{a.user_email}</span>
            <span style={s.code}>{a.system_code}</span>
            <span style={s.muted}>{new Date(a.assigned_at).toLocaleDateString()}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={!!a.allow_delete}
                onChange={async e => {
                  await updateAssignment(a.user_id, a.bucket_id, e.target.checked).catch(() => {});
                  load();
                }}
                title="Toggle delete permission"
              />
            </div>
            <button style={s.btnDanger} onClick={() => handleRemove(a.user_id, a.bucket_id, a.user_name, a.bucket_name)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AUDIT LOG TAB ───────────────────────────────────────────────────────────

const PAGE_SIZE = 50;
const OP_COLORS: Record<string, React.CSSProperties> = {
  GET:    { background: '#EFF6FF', color: '#3B82F6' },
  PUT:    { background: '#F0FDF4', color: '#16A34A' },
  DELETE: { background: '#FEF2F2', color: '#EF4444' },
};

function AuditTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [operation, setOperation] = useState('');
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(0, operation); }, []);

  async function load(newOffset: number, op: string, append = false) {
    setLoading(true);
    try {
      const res = await getAuditLog(PAGE_SIZE, newOffset, op || undefined);
      if (append) {
        setLogs(prev => [...prev, ...res.items]);
      } else {
        setLogs(res.items);
      }
      setTotal(res.total);
      setOffset(newOffset);
    } catch {}
    finally { setLoading(false); }
  }

  function handleOpFilter(op: string) {
    setOperation(op);
    load(0, op);
  }

  useEffect(() => {
    if (!sentinelRef.current || loading || logs.length >= total) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load(offset + PAGE_SIZE, operation, true);
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, total, logs.length, offset, operation]);

  return (
    <div>
      <div style={s.sectionHeader}>
        <h2 style={s.sectionTitle}>Audit Log</h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['', 'GET', 'PUT', 'DELETE'].map(op => (
            <button
              key={op}
              style={{ ...s.filterBtn, ...(operation === op ? s.filterBtnActive : {}) }}
              onClick={() => handleOpFilter(op)}
            >
              {op || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div style={s.table}>
        <div style={{ ...s.tableRow, ...s.auditRow, ...s.tableHeader }}>
          <span>User</span><span>Operation</span><span>Path</span><span>IP</span><span>Time</span>
        </div>
        {loading && logs.length === 0 && <p style={s.empty}>Loading...</p>}
        {!loading && logs.length === 0 && <p style={s.empty}>No log entries.</p>}
        {logs.map(l => (
          <div key={l.id} style={{ ...s.tableRow, ...s.auditRow }}>
            <div>
              <p style={{ ...s.bold, margin: 0 }}>{l.user_name}</p>
              <p style={{ ...s.muted, fontSize: '12px', margin: 0 }}>{l.user_email}</p>
            </div>
            <span>
              <span style={{ ...s.badge, ...(OP_COLORS[l.operation] || {}) }}>{l.operation}</span>
            </span>
            <span style={{ ...s.muted, fontFamily: 'monospace', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={l.path}>{l.path}</span>
            <span style={s.muted}>{l.ip || '-'}</span>
            <span style={s.muted}>{new Date(l.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && logs.length > 0 && <p style={{ ...s.empty, textAlign: 'center' as const }}>Loading more…</p>}
    </div>
  );
}

// ─── AWS KEYS TAB ────────────────────────────────────────────────────────────

function AwsKeysTab() {
  const [keys, setKeys] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ accessKeyId: '', email: '', ownerName: '', notes: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setKeys(await getAwsKeys()); } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createAwsKey({
        accessKeyId: form.accessKeyId.trim(),
        email: form.email.trim(),
        ownerName: form.ownerName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm({ accessKeyId: '', email: '', ownerName: '', notes: '' });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add key mapping');
    } finally { setLoading(false); }
  }

  async function handleDelete(id: string, keyId: string) {
    if (!confirm(`Remove mapping for key "${keyId}"?`)) return;
    try { await deleteAwsKey(id); load(); } catch {}
  }

  return (
    <div>
      <div style={s.sectionHeader}>
        <div>
          <h2 style={s.sectionTitle}>AWS Key → User Map</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
            Maps AWS IAM access keys to user emails for archive restore notifications.
          </p>
        </div>
        <button style={s.btnPrimary} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Mapping'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.formGrid}>
            <Field label="Access Key ID *" value={form.accessKeyId} onChange={v => setForm({ ...form, accessKeyId: v })} placeholder="AKIA..." />
            <Field label="Email *" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="user@example.com" type="email" />
            <Field label="Owner Name" value={form.ownerName} onChange={v => setForm({ ...form, ownerName: v })} placeholder="Jane Doe" />
            <Field label="Notes" value={form.notes} onChange={v => setForm({ ...form, notes: v })} placeholder="e.g. Prod IAM user for AtlPay" />
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btnPrimary, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Saving...' : 'Save Mapping'}
          </button>
        </form>
      )}

      <div style={s.table}>
        <div style={{ ...s.tableRow, ...s.awsKeysRow, ...s.tableHeader }}>
          <span>Access Key ID</span><span>Owner</span><span>Email</span><span>Notes</span><span>Added</span><span></span>
        </div>
        {keys.length === 0 && <p style={s.empty}>No key mappings yet.</p>}
        {keys.map(k => (
          <div key={k.id} style={{ ...s.tableRow, ...s.awsKeysRow }}>
            <span style={{ ...s.code, fontFamily: 'monospace', fontSize: '12px' }}>{k.access_key_id}</span>
            <span style={s.bold}>{k.owner_name || <span style={s.muted}>—</span>}</span>
            <span style={s.muted}>{k.email}</span>
            <span style={{ ...s.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={k.notes || ''}>{k.notes || '—'}</span>
            <span style={s.muted}>{new Date(k.created_at).toLocaleDateString()}</span>
            <button style={s.btnDanger} onClick={() => handleDelete(k.id, k.access_key_id)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── RESTORES TAB ────────────────────────────────────────────────────────────

const RESTORE_PAGE = 50;

function RestoresTab() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [restoredCount, setRestoredCount] = useState(0);
  const [notStartedCount, setNotStartedCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(0); }, []);

  async function load(newOffset: number, append = false) {
    setLoading(true);
    try {
      const res = await getRestoreRequests(RESTORE_PAGE, newOffset);
      if (append) {
        setItems(prev => [...prev, ...res.items]);
      } else {
        setItems(res.items);
      }
      setTotal(res.total);
      setPendingCount(res.pending_count ?? 0);
      setRestoredCount(res.restored_count ?? 0);
      setNotStartedCount(res.not_started_count ?? 0);
      setOffset(newOffset);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!sentinelRef.current || loading || items.length >= total) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load(offset + RESTORE_PAGE, true);
    });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loading, total, items.length, offset]);

  const inProgress = notStartedCount + pendingCount;

  return (
    <div>
      <div style={s.sectionHeader}>
        <div>
          <h2 style={s.sectionTitle}>Restore Requests</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748B' }}>
            {total} total request{total !== 1 ? 's' : ''}
          </p>
        </div>
        <button style={s.btnPrimary} onClick={() => load(0)} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <div style={s.statBox}>
            <span style={{ fontSize: '22px', fontWeight: 700, color: '#1E293B' }}>{restoredCount}</span>
            <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>Done</span>
          </div>
          <div style={s.statBox}>
            <span style={{ fontSize: '22px', fontWeight: 700, color: inProgress > 0 ? '#D97706' : '#1E293B' }}>{inProgress}</span>
            <span style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>In Progress</span>
          </div>
          <div style={{ ...s.statBox, flex: 1, alignItems: 'flex-start' as const }}>
            <div style={{ width: '100%', height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${total > 0 ? Math.round((restoredCount / total) * 100) : 0}%`, background: '#22C55E', borderRadius: '4px', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: '12px', color: '#64748B', marginTop: '6px' }}>
              {total > 0 ? Math.round((restoredCount / total) * 100) : 0}% complete
            </span>
          </div>
        </div>
      )}

      {loading && items.length === 0 && <p style={s.empty}>Loading...</p>}
      {!loading && items.length === 0 && <p style={s.empty}>No restore requests yet.</p>}

      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(460px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {items.map(item => <RestoreCard key={item.id} item={item} />)}
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />
      {loading && items.length > 0 && <p style={{ ...s.empty, textAlign: 'center' as const }}>Loading more…</p>}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  not_started: { label: 'Queued',    bg: '#F1F5F9', color: '#64748B' },
  pending:     { label: 'Restoring', bg: '#FEF3C7', color: '#D97706' },
  restored:    { label: 'Restored',  bg: '#DBEAFE', color: '#3B82F6' },
};

function RestoreCard({ item }: { item: any }) {
  const keyName = item.s3_key.split('/').pop() || item.s3_key;
  const sc = item.restore_status === 'restored' && item.post_notified
    ? { label: 'Complete', bg: '#DCFCE7', color: '#16A34A' }
    : (STATUS_CONFIG[item.restore_status] || STATUS_CONFIG.not_started);

  const noEmail = !!item.user_resolved && !item.email;

  const steps = [
    { label: "User ID'd",    done: !!item.user_resolved,              active: false,                             skipped: false },
    { label: 'Pre-notified', done: !!item.pre_notified,               active: false,                             skipped: noEmail && !item.pre_notified },
    { label: 'Restored',     done: item.restore_status === 'restored', active: item.restore_status === 'pending', skipped: false },
    { label: 'Post-notified', done: !!item.post_notified,             active: false,                             skipped: noEmail && !item.post_notified },
  ];

  const pipeline: React.ReactNode[] = [];
  steps.forEach((step, i) => {
    const dotBg    = step.done ? '#16A34A' : step.active ? '#F59E0B' : step.skipped ? '#F1F5F9' : '#E2E8F0';
    const dotColor = step.done ? '#fff'    : step.active ? '#fff'    : step.skipped ? '#94A3B8' : '#CBD5E1';
    const symbol   = step.done ? '✓'      : step.active ? '↻'       : step.skipped ? '—'      : '';
    const labelColor = step.done ? '#16A34A' : step.active ? '#F59E0B' : step.skipped ? '#CBD5E1' : '#94A3B8';

    pipeline.push(
      <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', minWidth: '72px' }}>
        <div style={{
          width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
          background: dotBg, border: step.skipped ? '1px dashed #CBD5E1' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', color: dotColor, fontWeight: 700,
        }}>
          {symbol}
        </div>
        <span style={{ fontSize: '10px', color: labelColor, fontWeight: step.done ? 600 : 400, textAlign: 'center' as const, lineHeight: '1.3' }}>
          {step.label}
          {step.skipped && <><br /><span style={{ fontSize: '9px' }}>no email</span></>}
        </span>
      </div>
    );
    if (i < steps.length - 1) {
      pipeline.push(
        <div key={`line-${i}`} style={{ flex: 1, height: '2px', marginBottom: '20px', background: step.done ? '#16A34A' : '#E2E8F0' }} />
      );
    }
  });

  return (
    <div style={s.restoreCard}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
        <span style={s.code}>{item.s3_bucket}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>{sc.label}</span>
          <span style={{ ...s.muted, fontSize: '11px' }}>{new Date(item.requested_at).toLocaleDateString()}</span>
        </div>
      </div>

      <p style={{ margin: '0 0 2px 0', fontWeight: 600, color: '#1E293B', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={item.s3_key}>
        {keyName}
      </p>
      <p style={{ margin: '0 0 10px 0', fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }} title={item.s3_key}>
        {item.s3_key}
      </p>

      <div style={{ margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' as const, fontSize: '12px', color: '#64748B' }}>
        {item.access_key_id
          ? <span style={{ fontFamily: 'monospace', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '4px', padding: '1px 6px' }}>{item.access_key_id}</span>
          : <span style={{ color: '#94A3B8' }}>Unknown key</span>
        }
        {item.access_key_id && <span style={{ color: '#CBD5E1' }}>→</span>}
        {item.email
          ? <span>{item.email}</span>
          : <span style={{ color: '#EF4444', fontSize: '11px' }}>no email mapping</span>
        }
      </div>

      {item.restored_at && (
        <p style={{ margin: '-6px 0 12px 0', fontSize: '11px', color: '#16A34A' }}>
          Restored {new Date(item.restored_at).toLocaleString()}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', paddingTop: '14px', borderTop: '1px solid #F1F5F9' }}>
        {pipeline}
      </div>
    </div>
  );
}

// ─── SHARED FIELD COMPONENT ──────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      <input style={s.input} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: '0' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '28px', borderBottom: '1px solid #E2E8F0', paddingBottom: '0' },
  tab: { padding: '10px 20px', border: 'none', background: 'transparent', fontSize: '14px', fontWeight: '500', color: '#64748B', cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive: { color: '#3B82F6', borderBottom: '2px solid #3B82F6' },
  tabContent: {},
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' as const },
  sectionTitle: { fontSize: '16px', fontWeight: '700', color: '#1E293B' },
  form: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '24px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: '600', color: '#374151' },
  input: { padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '7px', fontSize: '14px', color: '#1E293B', outline: 'none' },
  checkboxField: { display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '24px' },
  checkboxLabel: { fontSize: '14px', color: '#374151', cursor: 'pointer' },
  table: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflowX: 'auto' as const },
  tableHeader: { background: '#F8FAFC', fontWeight: '600', fontSize: '12px', color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
  tableRow: { display: 'grid', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #F1F5F9', gap: '12px', fontSize: '14px' },
  bucketsRow: { gridTemplateColumns: '3fr 1.5fr 90px 70px 80px 1.5fr 80px', minWidth: '820px' },
  usersRow: { gridTemplateColumns: '2fr 2fr 1fr 1fr 80px', minWidth: '560px' },
  assignmentsRow: { gridTemplateColumns: '2fr 2fr 1.5fr 1fr 60px 80px', minWidth: '620px' },
  bold: { fontWeight: '600', color: '#1E293B' },
  muted: { color: '#64748B' },
  code: { fontFamily: 'monospace', fontSize: '12px', color: '#3B82F6', background: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', width: 'fit-content', alignSelf: 'center' },
  badge: { padding: '2px 8px', borderRadius: '99px', fontSize: '12px', fontWeight: '600' },
  badgeBlue: { background: '#EFF6FF', color: '#3B82F6' },
  badgeGray: { background: '#F1F5F9', color: '#64748B' },
  empty: { padding: '24px 16px', color: '#94A3B8', fontSize: '14px' },
  btnPrimary: { padding: '9px 18px', background: '#3B82F6', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  btnDanger: { padding: '6px 12px', background: 'transparent', color: '#EF4444', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  error: { margin: 0, padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '13px' },
  systemCodePreview: { margin: '5px 0 0 0', fontSize: '11px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px' },
  systemCodeBadge: { display: 'inline-block', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', borderRadius: '4px', padding: '1px 7px', fontFamily: 'monospace', fontWeight: 600, fontSize: '12px', letterSpacing: '0.5px' },
  assignRow: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' as const },
  select: { flex: 1, padding: '9px 12px', border: '1px solid #D1D5DB', borderRadius: '7px', fontSize: '14px', color: '#1E293B', outline: 'none', background: '#fff' },
  arrow: { color: '#94A3B8', fontSize: '18px', flexShrink: 0 },
  auditRow: { gridTemplateColumns: '2fr 80px 3fr 1fr 1.5fr', minWidth: '680px' },
  filterBtn: { padding: '6px 14px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#64748B', fontWeight: '500' },
  filterBtnActive: { background: '#EFF6FF', color: '#3B82F6', borderColor: '#BFDBFE' },
  awsKeysRow: { gridTemplateColumns: '2fr 1.5fr 2fr 2fr 1fr 80px', minWidth: '720px' },
  restoreCard: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px' },
  statBox: { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 20px', display: 'flex', flexDirection: 'column' as const, minWidth: '110px' },
};
