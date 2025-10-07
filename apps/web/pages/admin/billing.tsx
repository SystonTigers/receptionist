import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Head from 'next/head';
import { apiFetch } from '@/lib/api-client';
import { useTenant } from '@/hooks/useTenant';

type SubscriptionStatus = {
  planId: string;
  status: string;
  startDate: string | null;
  nextBillingDate: string | null;
  delinquent: boolean;
  currentPeriodEnd?: string | null;
  cancelAt?: string | null;
  cancelledAt?: string | null;
};

type InvoiceSummary = {
  id: string;
  status: string | null;
  amountDue: number | null;
  amountPaid: number | null;
  currency: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  nextPaymentAttempt: string | null;
};

const statusFetcher = (path: string) => apiFetch<{ subscription: SubscriptionStatus }>(path);
const invoicesFetcher = (path: string) => apiFetch<{ invoices: InvoiceSummary[] }>(path);

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatCurrency(amount: number | null | undefined, currency: string | null | undefined) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency ?? 'GBP'
    }).format(amount);
  } catch {
    return `${currency ?? 'GBP'} ${amount.toFixed(2)}`;
  }
}

export default function BillingPage() {
  const { tenant } = useTenant();
  const { data: statusData, error: statusError, isLoading: statusLoading } = useSWR('/billing/status', statusFetcher);
  const { data: invoicesData, error: invoicesError, isLoading: invoicesLoading } = useSWR(
    '/billing/invoices',
    invoicesFetcher
  );
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [launchingPortal, setLaunchingPortal] = useState(false);

  const subscription = statusData?.subscription;
  const invoices = invoicesData?.invoices ?? [];
  const planLabel = useMemo(() => {
    if (!subscription?.planId) return 'Unknown plan';
    if (subscription.planId.toLowerCase().includes('premium')) return 'Premium';
    if (subscription.planId.toLowerCase().includes('pro')) return 'Pro';
    if (subscription.planId.toLowerCase().includes('basic')) return 'Basic';
    return subscription.planId;
  }, [subscription?.planId]);

  const handleLaunchPortal = async () => {
    setMessage(null);
    setLaunchingPortal(true);
    try {
      const returnUrl = typeof window !== 'undefined' ? `${window.location.origin}/admin/billing` : undefined;
      const { url } = await apiFetch<{ url: string }>('/billing/portal', {
        method: 'POST',
        body: { returnUrl }
      });
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (error) {
      console.error('Failed to launch billing portal', error);
      setMessage({ type: 'error', text: (error as Error).message ?? 'Unable to open billing portal' });
    } finally {
      setLaunchingPortal(false);
    }
  };

  return (
    <>
      <Head>
        <title>Billing &amp; Subscription | AI Hairdresser Receptionist</title>
      </Head>
      <main className="billing">
        <header>
          <div>
            <h1>Billing &amp; Subscription</h1>
            <p>Manage billing details for {tenant?.name ?? 'your salon'}.</p>
          </div>
          <button onClick={handleLaunchPortal} disabled={launchingPortal}>
            {launchingPortal ? 'Opening…' : 'Update payment method'}
          </button>
        </header>

        {message && <div className={`banner ${message.type}`}>{message.text}</div>}
        {subscription?.delinquent && !statusLoading && !statusError && (
          <div className="banner warning">
            Your account is marked as delinquent. Please update your payment method to restore full access.
          </div>
        )}

        <section className="card">
          <h2>Subscription status</h2>
          {statusLoading && <p>Loading subscription status…</p>}
          {statusError && <p className="error">{(statusError as Error).message}</p>}
          {subscription && (
            <ul>
              <li>
                <span>Plan</span>
                <strong>{planLabel}</strong>
              </li>
              <li>
                <span>Status</span>
                <strong className={`status ${subscription.status}`}>{subscription.status}</strong>
              </li>
              <li>
                <span>Started</span>
                <strong>{formatDate(subscription.startDate)}</strong>
              </li>
              <li>
                <span>Next billing date</span>
                <strong>{formatDate(subscription.nextBillingDate)}</strong>
              </li>
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Invoices</h2>
          {invoicesLoading && <p>Loading invoices…</p>}
          {invoicesError && <p className="error">{(invoicesError as Error).message}</p>}
          {!invoicesLoading && invoices.length === 0 && !invoicesError && <p>No invoices yet.</p>}
          {invoices.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Issued</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Amount due</th>
                  <th>Amount paid</th>
                  <th>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>{formatDate(invoice.createdAt)}</td>
                    <td>
                      {formatDate(invoice.periodStart)} → {formatDate(invoice.periodEnd)}
                    </td>
                    <td className={`status ${invoice.status ?? 'unknown'}`}>{invoice.status ?? 'unknown'}</td>
                    <td>{formatCurrency(invoice.amountDue, invoice.currency)}</td>
                    <td>{formatCurrency(invoice.amountPaid, invoice.currency)}</td>
                    <td>
                      {invoice.hostedInvoiceUrl ? (
                        <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noreferrer">
                          View
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
      <style jsx>{`
        .billing {
          padding: 2.5rem;
          display: grid;
          gap: 2rem;
          max-width: 960px;
          margin: 0 auto;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
        }
        header button {
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 9999px;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
        }
        header button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 2rem;
          box-shadow: 0 10px 40px rgba(15, 23, 42, 0.08);
        }
        .card ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 1rem;
        }
        .card li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 0.75rem;
        }
        .card li span {
          color: #64748b;
        }
        .card li strong {
          color: #0f172a;
        }
        .banner {
          padding: 1rem 1.25rem;
          border-radius: 12px;
          font-weight: 500;
        }
        .banner.error {
          background: #fee2e2;
          color: #b91c1c;
        }
        .banner.success {
          background: #dcfce7;
          color: #166534;
        }
        .banner.warning {
          background: #fef3c7;
          color: #92400e;
        }
        .error {
          color: #b91c1c;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
        }
        th,
        td {
          text-align: left;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid #e2e8f0;
        }
        th {
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #475569;
        }
        td a {
          color: #2563eb;
          font-weight: 600;
        }
        .status.active {
          color: #16a34a;
        }
        .status.past_due,
        .status.unpaid,
        .status.unknown {
          color: #b91c1c;
        }
      `}</style>
    </>
  );
}
