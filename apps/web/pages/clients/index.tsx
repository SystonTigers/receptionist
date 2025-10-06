import useSWR from 'swr';
import Head from 'next/head';
import { apiFetch } from '@/lib/api-client';

type ClientList = {
  clients: Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }>;
};

const fetcher = (path: string) => apiFetch<ClientList>(path);

export default function ClientsPage() {
  const { data, error } = useSWR('/clients', fetcher);

  return (
    <>
      <Head>
        <title>Clients | AI Hairdresser Receptionist</title>
      </Head>
      <main className="clients">
        <header>
          <h1>Clients</h1>
          <button>Add client (TODO)</button>
        </header>
        {error && <p className="error">Unable to load clients</p>}
        {!data && !error && <p>Loading…</p>}
        {data && (
          <ul>
            {data.clients?.map((client) => (
              <li key={client.id}>
                <strong>
                  {client.first_name} {client.last_name}
                </strong>
                <span>{client.phone}</span>
              </li>
            ))}
          </ul>
        )}
      </main>
      <style jsx>{`
        .clients {
          padding: 2rem;
        }
        header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }
        ul {
          list-style: none;
          display: grid;
          gap: 1rem;
          padding: 0;
        }
        li {
          background: white;
          padding: 1rem 1.25rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
          display: flex;
          justify-content: space-between;
        }
        button {
          background: #6366f1;
          color: white;
          border-radius: 8px;
          padding: 0.5rem 1rem;
          border: none;
        }
        .error {
          color: #dc2626;
        }
      `}</style>
    </>
  );
}
