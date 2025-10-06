import useSWR from 'swr';
import Head from 'next/head';
import { apiFetch } from '@/lib/api-client';

type AppointmentList = {
  appointments: Array<{
    id: string;
    client_id: string;
    stylist_id: string;
    service_id: string;
    start_time: string;
    status: string;
  }>;
};

const fetcher = (path: string) => apiFetch<AppointmentList>(path);

export default function AppointmentsPage() {
  const { data, error } = useSWR('/appointments', fetcher);

  return (
    <>
      <Head>
        <title>Appointments | AI Hairdresser Receptionist</title>
      </Head>
      <main className="appointments">
        <header>
          <h1>Appointments</h1>
          <button>Create appointment (TODO)</button>
        </header>
        {error && <p className="error">Failed to load appointments</p>}
        {!data && !error && <p>Loading…</p>}
        {data && (
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Stylist</th>
                <th>Service</th>
                <th>Start</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.appointments?.map((appointment) => (
                <tr key={appointment.id}>
                  <td>{appointment.client_id}</td>
                  <td>{appointment.stylist_id}</td>
                  <td>{appointment.service_id}</td>
                  <td>{appointment.start_time}</td>
                  <td>{appointment.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
      <style jsx>{`
        .appointments {
          padding: 2rem;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
        }
        th,
        td {
          padding: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          text-align: left;
        }
        button {
          background: #22c55e;
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 8px;
          border: none;
        }
        .error {
          color: #dc2626;
        }
      `}</style>
    </>
  );
}
