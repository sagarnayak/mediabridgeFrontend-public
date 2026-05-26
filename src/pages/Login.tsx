import { useState } from 'react';
import { login } from '../api/auth';

interface Props {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: Props) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      sessionStorage.setItem('mb_token', data.token);
      onLogin(data.token);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>MB</div>
        <h1 style={styles.title}>MediaBridge</h1>
        <p style={styles.subtitle}>Sign in to your account</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                style={{ ...styles.input, flex: 1, border: 'none', outline: 'none', padding: 0 }}
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
              <button type="button" style={styles.eyeBtn} onClick={() => setShowPassword(v => !v)}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.button, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
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
  },
  passwordWrapper: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    border: '1px solid #D1D5DB',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#1E293B',
    background: '#fff',
  },
  eyeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '0 0 0 8px',
    fontSize: '16px',
    lineHeight: 1,
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
