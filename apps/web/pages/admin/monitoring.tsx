import useSWR from 'swr';
import Head from 'next/head';
import { useTenant } from '@/hooks/useTenant';
import { apiFetch } from '@/lib/api-client';

type UsageResponse = {
  usage: Array<Record<string, unknown>>;
};

type AuditLogEntry = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  createdAt: string;
  userName?: string | null;
  userEmail?: string | null;
  userId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

type AuditLogsResponse = {
  logs: AuditLogEntry[];
};

const usageFetcher = (path: string) => apiFetch<UsageResponse>(path);
const auditFetcher = (path: string) => apiFetch<AuditLogsResponse>(path);

export default function MonitoringPage() {
  const { tenant } = useTenant();
  const { data: usage } = useSWR('/dashboard/usage', usageFetcher);
  const { data: auditLogs } = useSWR('/audit/logs', auditFetcher);
  const auditEntries = auditLogs?.logs ?? [];

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
          <h2>Recent audit trail</h2>
          {auditEntries.length === 0 ? (
            <p className="empty">No audit events recorded for this tenant yet.</p>
          ) : (
            <div className="audit-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Action</th>
                    <th scope="col">Resource</th>
                    <th scope="col">Actor</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((entry) => {
                    const actor = entry.userName || entry.userEmail || entry.userId || 'Unknown user';
                    const timestamp = new Date(entry.createdAt).toLocaleString();
                    return (
                      <tr key={entry.id}>
                        <td>{timestamp}</td>
                        <td>{entry.action}</td>
                        <td>
                          {entry.resource}
                          {entry.resourceId ? ` (${entry.resourceId})` : ''}
                        </td>
                        <td>{actor}</td>
                        <td>
                          <details>
                            <summary>View</summary>
                            <div className="diff-grid">
                              <div>
                                <h4>Before</h4>
                                <pre>{JSON.stringify(entry.before ?? null, null, 2)}</pre>
                              </div>
                              <div>
                                <h4>After</h4>
                                <pre>{JSON.stringify(entry.after ?? null, null, 2)}</pre>
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
        pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 8px;
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          background: #0f172a;
          color: #e2e8f0;
        }
        th,
        td {
          padding: 0.75rem;
          border-bottom: 1px solid rgba(226, 232, 240, 0.1);
          text-align: left;
          vertical-align: top;
        }
        th {
          font-weight: 600;
        }
        .audit-table {
          border-radius: 8px;
          overflow: hidden;
        }
        details {
          cursor: pointer;
        }
        details summary {
          color: #38bdf8;
          outline: none;
        }
        .diff-grid {
          display: grid;
          gap: 1rem;
          margin-top: 0.75rem;
        }
        .diff-grid pre {
          max-height: 200px;
          font-size: 0.85rem;
        }
        .empty {
          margin: 0;
          color: #94a3b8;
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
