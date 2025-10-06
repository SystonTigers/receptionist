import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Login failed');
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Log in | AI Hairdresser Receptionist</title>
      </Head>
      <main className="auth">
        <form onSubmit={handleSubmit}>
          <h1>Log in</h1>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Checking…' : 'Log in'}
          </button>
        </form>
      </main>
      <style jsx>{`
        .auth {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
        }
        form {
          background: white;
          padding: 2.5rem;
          border-radius: 16px;
          min-width: 380px;
          display: grid;
          gap: 1.25rem;
        }
        label {
          display: grid;
          gap: 0.5rem;
          font-weight: 500;
        }
        input {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid #cbd5f5;
        }
        button {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          background: #0ea5e9;
          color: white;
          border: none;
          font-weight: 600;
        }
        .error {
          color: #dc2626;
        }
      `}</style>
    </>
  );
}
