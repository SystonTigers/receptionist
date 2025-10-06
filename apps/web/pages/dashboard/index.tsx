import useSWR from 'swr';
import Link from 'next/link';
import Head from 'next/head';
import { apiFetch } from '@/lib/api-client';

type DashboardSummary = {
  upcomingAppointments: number;
  pendingConfirmations: number;
  pendingMessages: number;
  revenueLast30d: number;
};

const fetcher = (path: string) => apiFetch<DashboardSummary>(path);

export default function DashboardPage() {
  const { data, error } = useSWR('/dashboard/summary', fetcher);

  return (
    <>
      <Head>
        <title>Dashboard | AI Hairdresser Receptionist</title>
      </Head>
      <main className="dashboard">
        <aside>
          <nav>
            <Link href="/dashboard">Overview</Link>
            <Link href="/appointments">Appointments</Link>
            <Link href="/clients">Clients</Link>
            <Link href="/stylists">Stylists</Link>
            <Link href="/admin/monitoring">Monitoring</Link>
            <Link href="/admin/marketing">Marketing Studio</Link>
          </nav>
        </aside>
        <section className="content">
          <h1>Tenant overview</h1>
          {error && <p className="error">Failed to load summary</p>}
          {!data && !error && <p>Loading metrics…</p>}
          {data && (
            <div className="grid">
              <article>
                <h2>Upcoming appointments</h2>
                <p>{data.upcomingAppointments}</p>
              </article>
              <article>
                <h2>Pending confirmations</h2>
                <p>{data.pendingConfirmations}</p>
              </article>
              <article>
                <h2>Messages waiting</h2>
                <p>{data.pendingMessages}</p>
              </article>
              <article>
                <h2>Revenue (30d)</h2>
                <p>£{data.revenueLast30d?.toFixed(2)}</p>
              </article>
            </div>
          )}
        </section>
      </main>
      <style jsx>{`
        .dashboard {
          display: grid;
          grid-template-columns: 240px 1fr;
          min-height: 100vh;
        }
        aside {
          background: #0f172a;
          color: white;
          padding: 2rem 1.5rem;
        }
        nav {
          display: grid;
          gap: 1rem;
        }
        nav :global(a) {
          color: inherit;
          font-weight: 500;
        }
        .content {
          padding: 2.5rem;
          background: #f8fafc;
        }
        .grid {
          margin-top: 2rem;
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        article {
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
