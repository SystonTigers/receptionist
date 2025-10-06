import { useState } from 'react';
import Head from 'next/head';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [form, setForm] = useState({
    tenantName: '',
    email: '',
    password: '',
    phone: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || 'Signup failed');
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
        <title>Sign up | AI Hairdresser Receptionist</title>
      </Head>
      <main className="auth">
        <form onSubmit={handleSubmit}>
          <h1>Create your salon workspace</h1>
          <label>
            Salon name
            <input
              value={form.tenantName}
              onChange={(e) => setForm((f) => ({ ...f, tenantName: e.target.value }))}
              required
            />
          </label>
          <label>
            Admin email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              required
            />
          </label>
          <label>
            Admin password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
          </label>
          <label>
            Contact phone
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Creating workspace…' : 'Sign up'}
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
          background: #6366f1;
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
