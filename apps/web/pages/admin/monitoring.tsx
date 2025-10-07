import useSWR from 'swr';
import Head from 'next/head';

import { useMemo } from 'react';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTenant } from '@/hooks/useTenant';
import { apiFetch } from '@/lib/api-client';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

type ObservabilityAlert = {
  id: string;
  metric: string;
  observed: number;
  baseline?: number;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
};

type ObservabilitySummary = {
  timeframe: { start: string; end: string };
  requests: Array<{ date: string; count: number }>;
  errorRate: Array<{ date: string; errors: number; requests: number; rate: number }>;
  latency: {
    p50: number;
    p95: number;
    average: number;
    dailyAverage: Array<{ date: string; value: number }>;
  };
  messaging: {
    success: number;
    failure: number;
    failureRate: number;
    timeline: Array<{ date: string; success: number; failure: number }>;
  };
  alerts: ObservabilityAlert[];
};

type SummaryResponse = ObservabilitySummary;

const fetcher = (path: string) => apiFetch<SummaryResponse>(path);

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function severityColor(severity: ObservabilityAlert['severity']) {
  switch (severity) {
    case 'critical':
      return '#ef4444';
    case 'warning':
      return '#f97316';
    default:
      return '#38bdf8';
  }

import { UsageOverview } from '@ai-hairdresser/shared';
import { useTenant } from '@/hooks/useTenant';
import { apiFetch } from '@/lib/api-client';

const fetcher = (path: string) => apiFetch<UsageOverview>(path);

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

  const { data: summary } = useSWR('/observability/summary', fetcher, {
    refreshInterval: 60_000
  });

  const totalRequests = useMemo(
    () => summary?.requests.reduce((acc, item) => acc + item.count, 0) ?? 0,
    [summary]
  );
  const latestErrorRate = summary?.errorRate.at(-1)?.rate ?? 0;
  const messagingFailureRate = summary?.messaging.failureRate ?? 0;

  const requestChart = useMemo(() => {
    if (!summary) return null;
    return {
      labels: summary.requests.map((item) => item.date),
      datasets: [
        {
          label: 'Requests',
          data: summary.requests.map((item) => item.count),
          borderColor: '#22d3ee',
          backgroundColor: 'rgba(34, 211, 238, 0.2)',
          tension: 0.3
        },
        {
          label: 'Errors',
          data: summary.errorRate.map((item) => item.errors),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.2)',
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    };
  }, [summary]);

  const latencyChart = useMemo(() => {
    if (!summary) return null;
    return {
      labels: summary.latency.dailyAverage.map((item) => item.date),
      datasets: [
        {
          label: 'Average duration (ms)',
          data: summary.latency.dailyAverage.map((item) => Number(item.value.toFixed(2))),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          tension: 0.3
        }
      ]
    };
  }, [summary]);

  const messagingChart = useMemo(() => {
    if (!summary) return null;
    return {
      labels: summary.messaging.timeline.map((item) => item.date),
      datasets: [
        {
          label: 'Successful deliveries',
          data: summary.messaging.timeline.map((item) => item.success),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          tension: 0.3
        },
        {
          label: 'Failures',
          data: summary.messaging.timeline.map((item) => item.failure),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.2)',
          tension: 0.3
        }
      ]
    };
  }, [summary]);

  const { data: usage, error } = useSWR('/dashboard/usage', fetcher);

  return (
    <>
      <Head>
        <title>Monitoring | AI Hairdresser Receptionist</title>
      </Head>
      <main className="monitoring">

        <header className="page-header">
          <div>
            <h1>Monitoring &amp; Observability</h1>
            <p>Tenant: {tenant?.name ?? 'Loading…'}</p>
          </div>
          <div className="timeframe">
            <span>Window</span>
            <strong>
              {summary
                ? `${new Date(summary.timeframe.start).toLocaleDateString()} → ${new Date(summary.timeframe.end).toLocaleDateString()}`
                : '—'}
            </strong>
          </div>
        </header>

        <section className="metrics-grid">
          <div className="metric-card">
            <span>Total requests</span>
            <strong>{totalRequests.toLocaleString()}</strong>
          </div>
          <div className="metric-card">
            <span>Error rate</span>
            <strong>{formatPercent(latestErrorRate)}</strong>
          </div>
          <div className="metric-card">
            <span>P95 latency</span>
            <strong>{summary ? `${summary.latency.p95.toFixed(0)} ms` : '—'}</strong>
          </div>
          <div className="metric-card">
            <span>Messaging failure rate</span>
            <strong>{formatPercent(messagingFailureRate)}</strong>
          </div>
        </section>

        <section className="chart-section">
          <h2>Request volume &amp; errors</h2>
          {requestChart ? (
            <Line
              data={requestChart}
              options={{
                responsive: true,
                interaction: { mode: 'index', intersect: false },
                stacked: false,
                scales: {
                  y: { beginAtZero: true },
                  y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: { drawOnChartArea: false }
                  }
                }
              }}
            />
          ) : (
            <p className="placeholder">Loading…</p>

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
            </div
          )}
        </section>

        <section className="chart-section">
          <h2>Latency trend</h2>
          {latencyChart ? (
            <Line
              data={latencyChart}
              options={{ responsive: true, interaction: { mode: 'index', intersect: false } }}
            />
          ) : (
            <p className="placeholder">Loading…</p>
          )}
        </section>

        <section className="chart-section">
          <h2>Messaging delivery</h2>
          {messagingChart ? (
            <Line data={messagingChart} options={{ responsive: true }} />
          ) : (
            <p className="placeholder">Loading…</p>
          )}
        </section>

        <section className="alerts">
          <h2>Active alerts</h2>
          {summary?.alerts?.length ? (
            <ul>
              {summary.alerts.map((alert) => (
                <li key={alert.id} style={{ borderColor: severityColor(alert.severity) }}>
                  <div>
                    <strong>{alert.title}</strong>
                    <span className={`badge ${alert.severity}`}>{alert.severity}</span>
                  </div>
                  <p>{alert.description}</p>
                  <small>
                    Observed: {alert.observed.toFixed(2)}{' '}
                    {alert.baseline !== undefined ? `| Baseline ${alert.baseline.toFixed(2)}` : null}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="placeholder">No active anomalies detected.</p>
          )}
        </section>
      </main>
      <style jsx>{`
        .monitoring {
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .page-header h1 {
          font-size: 1.875rem;
          font-weight: 700;
        }
        .timeframe {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          font-size: 0.875rem;
          color: #475569;
        }
        .timeframe strong {
          font-size: 1rem;
          color: #0f172a;
        }
        .metrics-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .metric-card {
          background: #0f172a;
          color: #e2e8f0;
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .metric-card span {
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .metric-card strong {
          font-size: 1.75rem;
        }
        .chart-section {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.1);
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
        .chart-section h2 {
          margin-bottom: 1rem;
        }
        .alerts ul {
          list-style: none;
          padding: 0;
          display: grid;
          gap: 1rem;
        }
        .alerts li {
          border-left: 4px solid #38bdf8;
          background: white;
          border-radius: 8px;
          padding: 1rem 1.25rem;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
        }
        .alerts li > div {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }
        .alerts .badge {
          padding: 0.25rem 0.65rem;
          border-radius: 9999px;
          color: white;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .alerts .badge.info {
          background: #38bdf8;
        }
        .alerts .badge.warning {
          background: #f97316;
        }
        .alerts .badge.critical {
          background: #ef4444;
        }
        .placeholder {
          color: #64748b;
          font-size: 0.95rem;
        }
      `}</style>
    </>
  );
}
