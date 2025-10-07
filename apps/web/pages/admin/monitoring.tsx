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
