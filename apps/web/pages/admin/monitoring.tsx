import useSWR from 'swr';
import Head from 'next/head';
import { useTenant } from '@/hooks/useTenant';
import { apiFetch } from '@/lib/api-client';

type UsageResponse = {
  usage: Array<Record<string, unknown>>;
};

const fetcher = (path: string) => apiFetch<UsageResponse>(path);

export default function MonitoringPage() {
  const { tenant } = useTenant();
  const { data: usage } = useSWR('/dashboard/usage', fetcher);

  return (
    <>
      <Head>
        <title>Monitoring | AI Hairdresser Receptionist</title>
      </Head>
      <main className="monitoring">
        <section>
          <h1>Monitoring & Overrides</h1>
          <p>Signed in as tenant: {tenant?.name ?? 'Loading…'}</p>
        </section>
        <section>
          <h2>Usage metrics</h2>
          <pre>{JSON.stringify(usage?.usage ?? [], null, 2)}</pre>
        </section>
        <section>
          <h2>Manual actions</h2>
          <button>Force AI fallback to human (TODO)</button>
          <button>Send broadcast message (TODO)</button>
        </section>
      </main>
      <style jsx>{`
        .monitoring {
          padding: 2rem;
          display: grid;
          gap: 2rem;
        }
        pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 8px;
          overflow-x: auto;
        }
        button {
          margin-right: 1rem;
          padding: 0.75rem 1.25rem;
          border-radius: 8px;
          border: none;
          background: #f97316;
          color: white;
          font-weight: 600;
        }
      `}</style>
    </>
  );
}
