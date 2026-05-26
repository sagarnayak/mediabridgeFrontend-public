import { useState } from 'react';
import { setupMasterAdmin } from '../api/auth';

interface Props {
  onComplete: (token: string) => void;
}

export default function Setup({ onComplete }: Props) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await setupMasterAdmin(form);
      sessionStorage.setItem('mb_token', data.token);
      onComplete(data.token);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>MB</div>
        <h1 style={styles.title}>Welcome to MediaBridge</h1>
        <p style={styles.subtitle}>Set up your master admin account to get started.</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Full Name</label>
            <input
              style={styles.input}
              type="text"
              placeholder="John Doe"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="admin@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.button, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Setting up...' : 'Create Admin Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#F8FAFC',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #E2E8F0',
    padding: '48px 40px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  },
  logo: {
    width: '48px',
    height: '48px',
    background: '#3B82F6',
    borderRadius: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: '700',
    fontSize: '16px',
    marginBottom: '24px',
  },
  title: {
    margin: '0 0 8px',
    fontSize: '22px',
    fontWeight: '700',
    color: '#1E293B',
  },
  subtitle: {
    margin: '0 0 32px',
    fontSize: '14px',
    color: '#64748B',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    padding: '10px 14px',
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#1E293B',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  button: {
    padding: '11px',
    background: '#3B82F6',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '4px',
  },
  error: {
    margin: 0,
    padding: '10px 14px',
    background: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '8px',
    color: '#DC2626',
    fontSize: '13px',
  },
};
