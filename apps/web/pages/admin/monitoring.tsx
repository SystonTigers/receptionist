import useSWR from 'swr';
import Head from 'next/head';
import { UsageOverview } from '@ai-hairdresser/shared';
import { useTenant } from '@/hooks/useTenant';
import { apiFetch } from '@/lib/api-client';

const fetcher = (path: string) => apiFetch<UsageOverview>(path);

function formatLimit(limit: number | null, measurement: string) {
  if (limit === null) return 'Unlimited';
  if (measurement === 'tokens') return `${limit.toLocaleString()} tokens`;
  return limit.toLocaleString();
}

function formatUsed(used: number, measurement: string) {
  if (measurement === 'tokens') return `${Math.round(used).toLocaleString()} tokens`;
  return used.toLocaleString();
}

function formatRemaining(remaining: number | null, measurement: string) {
  if (remaining === null) return 'Unlimited';
  const value = Math.max(Math.floor(remaining), 0);
  return measurement === 'tokens' ? `${value.toLocaleString()} tokens` : value.toLocaleString();
}

export default function MonitoringPage() {
  const { tenant } = useTenant();
  const { data: usage, error } = useSWR('/dashboard/usage', fetcher);

  return (
    <>
      <Head>
        <title>Monitoring | AI Hairdresser Receptionist</title>
      </Head>
      <main className="monitoring">
        <section className="header">
          <h1>Monitoring & Overrides</h1>
          <p>Signed in as tenant: {tenant?.name ?? 'Loading…'}</p>
          {usage && <span className="tier">Current plan: {usage.tier.toUpperCase()}</span>}
        </section>
        <section>
          <h2>Usage vs tier limits</h2>
          {error && <p className="error">Failed to load usage overview.</p>}
          {!usage && !error && <p>Loading usage data…</p>}
          {usage && (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Period</th>
                  <th>Used</th>
                  <th>Limit</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {usage.quotas.map((quota) => (
                  <tr key={quota.eventType}>
                    <td>{quota.label}</td>
                    <td>{quota.period === 'month' ? 'Monthly' : 'Daily'}</td>
                    <td>{formatUsed(quota.used, quota.measurement)}</td>
                    <td>{formatLimit(quota.limit, quota.measurement)}</td>
                    <td>{formatRemaining(quota.remaining, quota.measurement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section>
          <h2>Recent usage metrics</h2>
          {usage && usage.metrics.length === 0 && <p>No usage metrics recorded yet.</p>}
          {usage && usage.metrics.length > 0 && (
            <ul className="metrics">
              {usage.metrics.map((metric) => (
                <li key={`${metric.metric}-${metric.occurredAt}`}>
                  <strong>{metric.metric}</strong>
                  <span>{metric.value.toLocaleString()}</span>
                  <small>{new Date(metric.occurredAt).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
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
        .header {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .tier {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          background: #1d4ed8;
          color: white;
          font-size: 0.85rem;
          letter-spacing: 0.04em;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: #0f172a;
          color: #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }
        th,
        td {
          padding: 0.85rem 1rem;
          text-align: left;
        }
        thead {
          background: rgba(15, 23, 42, 0.8);
        }
        tbody tr:nth-child(even) {
          background: rgba(15, 23, 42, 0.6);
        }
        tbody tr:nth-child(odd) {
          background: rgba(15, 23, 42, 0.4);
        }
        .metrics {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.75rem;
        }
        .metrics li {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 0.75rem 1rem;
          background: #f8fafc;
          border-radius: 10px;
        }
        .metrics strong {
          color: #0f172a;
        }
        .metrics span {
          font-weight: 600;
        }
        .metrics small {
          color: #475569;
        }
        .error {
          color: #dc2626;
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
