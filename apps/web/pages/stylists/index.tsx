import useSWR from 'swr';
import Head from 'next/head';
import { apiFetch } from '@/lib/api-client';

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
  const { data, error } = useSWR('/stylists', fetcher);

  return (
    <>
      <Head>
        <title>Stylists | AI Hairdresser Receptionist</title>
      </Head>
      <main className="stylists">
        <header>
          <h1>Stylists</h1>
          <button>Invite stylist (TODO)</button>
        </header>
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
        .error {
          color: #dc2626;
        }
      `}</style>
    </>
  );
}
