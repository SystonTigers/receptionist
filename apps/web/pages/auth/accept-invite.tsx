import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState, type FormEvent } from 'react';

export default function AcceptInvitePage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (typeof router.query.token === 'string') {
      setToken(router.query.token);
    }
  }, [router.query.token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!token) {
      setMessage({ type: 'error', text: 'Invitation token is missing.' });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, firstName, lastName, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error ?? 'Failed to accept invitation');
      }

      setMessage({ type: 'success', text: 'Invitation accepted! You can now sign in.' });
      setPassword('');
    } catch (error) {
      console.error('Accept invite failed', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to accept invitation.'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Accept Invitation | AI Hairdresser Receptionist</title>
      </Head>
      <main className="accept-invite">
        <section>
          <h1>Join your team</h1>
          <p>Set your details to activate your account.</p>
          {message && <p className={`message ${message.type}`}>{message.text}</p>}
          <form onSubmit={handleSubmit}>
            <label>
              <span>Invitation token</span>
              <input type="text" value={token} onChange={(event) => setToken(event.target.value)} required />
            </label>
            <label>
              <span>First name</span>
              <input type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </label>
            <label>
              <span>Last name</span>
              <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
            </label>
            <label>
              <span>Create password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? 'Activating…' : 'Accept invite'}
            </button>
          </form>
        </section>
      </main>
      <style jsx>{`
        .accept-invite {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          padding: 2rem;
        }
        section {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.12);
          width: min(420px, 100%);
          display: grid;
          gap: 1.25rem;
        }
        h1 {
          margin: 0;
          font-size: 1.75rem;
        }
        p {
          margin: 0;
          color: #475569;
        }
        form {
          display: grid;
          gap: 1rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-weight: 500;
          color: #0f172a;
        }
        input {
          padding: 0.75rem 1rem;
          border-radius: 10px;
          border: 1px solid #cbd5f5;
          font-size: 1rem;
        }
        .primary {
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 10px;
          padding: 0.85rem 1.25rem;
          font-size: 1rem;
          cursor: pointer;
        }
        .primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .message {
          padding: 0.75rem 1rem;
          border-radius: 10px;
          font-weight: 500;
        }
        .message.success {
          background: #dcfce7;
          color: #166534;
        }
        .message.error {
          background: #fee2e2;
          color: #991b1b;
        }
      `}</style>
    </>
  );
}
