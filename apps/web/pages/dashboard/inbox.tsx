import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';

type AssistResponse = {
  suggestion: string;
};

type StatusState = {
  type: 'success' | 'error';
  message: string;
} | null;

export default function InboxPage() {
  const [clientMessage, setClientMessage] = useState('');
  const [intent, setIntent] = useState('');
  const [bookingHistory, setBookingHistory] = useState('');
  const [notes, setNotes] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [draftResponse, setDraftResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState<StatusState>(null);

  const requestSuggestion = async () => {
    if (!clientMessage.trim()) {
      setStatus({ type: 'error', message: 'Provide the client message first.' });
      return;
    }

    setIsLoading(true);
    setStatus(null);

    try {
      const context: Record<string, unknown> = {};
      if (intent.trim()) {
        context.intent = intent.trim();
      }
      if (notes.trim()) {
        context.notes = notes.trim();
      }
      if (bookingHistory.trim()) {
        context.bookingHistory = bookingHistory
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      }

      const response = await apiFetch<AssistResponse>('/assist', {
        method: 'POST',
        body: {
          message: clientMessage.trim(),
          context: Object.keys(context).length ? context : undefined
        }
      });

      setAiSuggestion(response.suggestion);
      setDraftResponse(response.suggestion);
      setStatus({ type: 'success', message: 'AI suggestion ready. Adjust before sending if needed.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to generate suggestion.';
      setStatus({ type: 'error', message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draftResponse.trim() || !phoneNumber.trim()) {
      setStatus({ type: 'error', message: 'Phone number and response are required to send an SMS.' });
      return;
    }

    setIsSending(true);
    setStatus(null);

    try {
      await apiFetch('/messaging/outbound', {
        method: 'POST',
        body: {
          to: phoneNumber.trim(),
          body: draftResponse.trim(),
          channel: 'sms'
        }
      });
      setStatus({ type: 'success', message: 'Message queued via SMS (Twilio stub).' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to queue SMS.';
      setStatus({ type: 'error', message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Head>
        <title>Inbox | AI Hairdresser Receptionist</title>
      </Head>
      <main className="dashboard">
        <aside>
          <nav>
            <Link href="/dashboard">Overview</Link>
            <Link href="/dashboard/bookings">Bookings calendar</Link>
            <Link href="/dashboard/inbox">Inbox</Link>
            <Link href="/appointments">Appointments</Link>
            <Link href="/clients">Clients</Link>
            <Link href="/stylists">Stylists</Link>
            <Link href="/admin/monitoring">Monitoring</Link>
            <Link href="/admin/marketing">Marketing Studio</Link>
          </nav>
        </aside>
        <section className="content">
          <header>
            <div>
              <h1>Inbox assistant</h1>
              <p>Let the AI receptionist draft a reply, edit manually, then send via SMS.</p>
            </div>
            <button className="primary" onClick={requestSuggestion} disabled={isLoading}>
              {isLoading ? 'Generating…' : 'Generate suggestion'}
            </button>
          </header>

          {status && (
            <p className={status.type === 'error' ? 'status status--error' : 'status status--success'}>{status.message}</p>
          )}

          <div className="grid">
            <article>
              <h2>Client message</h2>
              <textarea
                value={clientMessage}
                onChange={(event) => setClientMessage(event.target.value)}
                placeholder="Paste the inbound SMS or WhatsApp message here"
              />
              <div className="field-group">
                <label htmlFor="intent">Service intent</label>
                <input
                  id="intent"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                  placeholder="Balayage refresh, fringe trim, consultation…"
                />
              </div>
              <div className="field-group">
                <label htmlFor="history">Booking history</label>
                <textarea
                  id="history"
                  value={bookingHistory}
                  onChange={(event) => setBookingHistory(event.target.value)}
                  placeholder="One per line. e.g. 12 May – Cut & Finish"
                />
              </div>
              <div className="field-group">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Allergies, stylist preferences, loyalty status…"
                />
              </div>
            </article>
            <article>
              <h2>AI suggestion</h2>
              <textarea value={aiSuggestion ?? ''} readOnly placeholder="Generate a response to see the AI draft." />
              <h3>Edit before sending</h3>
              <textarea
                value={draftResponse}
                onChange={(event) => setDraftResponse(event.target.value)}
                placeholder="Edit the reply that will be sent to the client"
              />
              <div className="field-group">
                <label htmlFor="phone">Client phone number</label>
                <input
                  id="phone"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+44 7123 456789"
                />
              </div>
              <button className="secondary" onClick={handleSend} disabled={isSending}>
                {isSending ? 'Sending…' : 'Send via SMS'}
              </button>
            </article>
          </div>
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
          display: grid;
          gap: 1.5rem;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
        }
        header h1 {
          margin: 0 0 0.25rem;
        }
        header p {
          margin: 0;
          color: #475569;
        }
        button.primary,
        button.secondary {
          border: none;
          border-radius: 999px;
          padding: 0.75rem 1.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }
        button.primary {
          background: #6366f1;
          color: white;
        }
        button.secondary {
          background: #0f172a;
          color: white;
          width: fit-content;
        }
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1.5rem;
        }
        article {
          background: white;
          padding: 1.5rem;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
          display: grid;
          gap: 1rem;
        }
        textarea {
          min-height: 120px;
          resize: vertical;
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid #cbd5f5;
          font: inherit;
        }
        textarea[readOnly] {
          background: #f1f5f9;
        }
        input {
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid #cbd5f5;
          font: inherit;
        }
        .field-group {
          display: grid;
          gap: 0.5rem;
        }
        label {
          font-weight: 500;
          color: #1e293b;
        }
        .status {
          padding: 0.75rem 1rem;
          border-radius: 12px;
          font-weight: 500;
        }
        .status--success {
          background: #dcfce7;
          color: #166534;
        }
        .status--error {
          background: #fee2e2;
          color: #b91c1c;
        }
        @media (max-width: 960px) {
          .dashboard {
            grid-template-columns: 1fr;
          }
          aside {
            padding: 1.5rem;
          }
          header {
            flex-direction: column;
            align-items: flex-start;
          }
          button.primary {
            align-self: stretch;
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
