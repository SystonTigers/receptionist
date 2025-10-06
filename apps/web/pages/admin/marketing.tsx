import { useState } from 'react';
import Head from 'next/head';
import { apiFetch } from '@/lib/api-client';

export default function MarketingToolsPage() {
  const [theme, setTheme] = useState('last-minute colour offer');
  const [service, setService] = useState('Balayage highlight package');
  const [copy, setCopy] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setError(null);
    try {
      const payload = await apiFetch<{ copy: string }>('/marketing/generate', {
        method: 'POST',
        body: { theme, service }
      });
      setCopy(payload.copy);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <>
      <Head>
        <title>Marketing Studio | AI Hairdresser Receptionist</title>
      </Head>
      <main className="marketing">
        <h1>Marketing Studio</h1>
        <label>
          Campaign theme
          <input value={theme} onChange={(e) => setTheme(e.target.value)} />
        </label>
        <label>
          Highlight service
          <input value={service} onChange={(e) => setService(e.target.value)} />
        </label>
        <button onClick={generate}>Generate post copy</button>
        {error && <p className="error">{error}</p>}
        {copy && (
          <section className="result">
            <h2>Suggested copy</h2>
            <p>{copy}</p>
          </section>
        )}
      </main>
      <style jsx>{`
        .marketing {
          padding: 2rem;
          display: grid;
          gap: 1rem;
          max-width: 640px;
        }
        label {
          display: grid;
          gap: 0.5rem;
        }
        input {
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid #cbd5f5;
        }
        button {
          background: #8b5cf6;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          width: fit-content;
        }
        .result {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
        .error {
          color: #dc2626;
        }
      `}</style>
    </>
  );
}
