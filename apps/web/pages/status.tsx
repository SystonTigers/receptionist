import Head from 'next/head';
import useSWR from 'swr';
import { apiFetch } from '@/lib/api-client';

type StatusResponse = {
  ok: boolean;
  timestamp: string;
  environment: string;
  version: string;
  supabase: {
    ok: boolean;
    latencyMs: number;
  };
};

const fetcher = (path: string) => apiFetch<StatusResponse>(path, { tenantId: 'public-status' });

export default function StatusPage() {
  const { data } = useSWR('/status', fetcher, { refreshInterval: 30000 });

  return (
    <>
      <Head>
        <title>System Status | AI Hairdresser Receptionist</title>
      </Head>
      <main className="status">
        <h1>System status</h1>
        <section className={`panel ${data?.ok ? 'healthy' : 'degraded'}`}>
          <div className="indicator" />
          <div>
            <h2>{data?.ok ? 'Operational' : 'Degraded performance'}</h2>
            <p>Last checked: {data ? new Date(data.timestamp).toLocaleString() : '—'}</p>
          </div>
        </section>

        <div className="grid">
          <article>
            <h3>Environment</h3>
            <p>{data?.environment ?? 'unknown'}</p>
            <p>Version: {data?.version ?? 'unknown'}</p>
          </article>
          <article>
            <h3>Supabase</h3>
            <p>Status: {data?.supabase.ok ? 'Healthy' : 'Unavailable'}</p>
            <p>Latency: {data ? `${data.supabase.latencyMs.toFixed(0)} ms` : '—'}</p>
          </article>
        </div>
      </main>
      <style jsx>{`
        .status {
          padding: 3rem 2rem;
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        h1 {
          font-size: 2rem;
          font-weight: 700;
        }
        .panel {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.1);
        }
        .panel.healthy {
          background: #ecfdf5;
          color: #065f46;
        }
        .panel.degraded {
          background: #fff7ed;
          color: #9a3412;
        }
        .indicator {
          width: 1rem;
          height: 1rem;
          border-radius: 999px;
          background: currentColor;
        }
        .grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        }
        article {
          padding: 1.25rem;
          border-radius: 10px;
          background: white;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
        }
        article h3 {
          margin-bottom: 0.5rem;
        }
      `}</style>
    </>
  );
}
