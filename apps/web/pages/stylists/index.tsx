import useSWR from 'swr';
import Head from 'next/head';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useFeatureFlag } from '@/lib/feature-flags';

type StylistList = {
  stylists: Array<{
    id: string;
    first_name: string;
    last_name: string;
    specialties: string[];
    working_hours: unknown;
  }>;
};

const fetcher = (path: string) => apiFetch<StylistList>(path);

export default function StylistsPage() {
  const teamFeature = useFeatureFlag('team_accounts');
  const shouldFetch = teamFeature.enabled;
  const { data, error } = useSWR(shouldFetch ? '/stylists' : null, fetcher);

  return (
    <>
      <Head>
        <title>Stylists | AI Hairdresser Receptionist</title>
      </Head>
      <main className="stylists">
        <header>
          <h1>Stylists</h1>
          {teamFeature.enabled ? <button>Invite stylist (TODO)</button> : null}
        </header>
        {teamFeature.loading && <p>Checking your plan…</p>}
        {!teamFeature.loading && !teamFeature.enabled && (
          <div className="locked">
            <h2>Team accounts are locked</h2>
            <p>
              Your current subscription does not include team account management. Upgrade to the Basic plan to invite stylists
              and manage staff scheduling.
            </p>
            <Link href="/admin/plan">Go to Subscription &amp; billing</Link>
          </div>
        )}
        {teamFeature.enabled && (
          <>
            {error && <p className="error">Unable to load stylists</p>}
            {!data && !error && <p>Loading…</p>}
            {data && (
              <div className="grid">
                {data.stylists?.map((stylist) => (
                  <article key={stylist.id}>
                    <h3>
                      {stylist.first_name} {stylist.last_name}
                    </h3>
                    <p>Specialties: {stylist.specialties?.join(', ') || '—'}</p>
                    <pre>{JSON.stringify(stylist.working_hours, null, 2)}</pre>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </main>
      <style jsx>{`
        .stylists {
          padding: 2rem;
        }
        header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
        }
        article {
          background: white;
          padding: 1rem;
          border-radius: 10px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
        pre {
          background: #0f172a;
          color: #e2e8f0;
          padding: 0.75rem;
          border-radius: 8px;
          overflow-x: auto;
        }
        button {
          background: #38bdf8;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 8px;
        }
        .locked {
          background: #f1f5f9;
          border-radius: 12px;
          padding: 2rem;
          max-width: 640px;
          box-shadow: inset 0 0 0 1px #cbd5f5;
          margin-top: 2rem;
        }
        .locked :global(a) {
          color: #2563eb;
          font-weight: 600;
        }
        .error {
          color: #dc2626;
        }
      `}</style>
    </>
  );
}
