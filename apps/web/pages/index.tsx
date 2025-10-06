import Link from 'next/link';
import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>AI Hairdresser Receptionist</title>
      </Head>
      <main className="home">
        <section>
          <h1>AI Hairdresser Receptionist</h1>
          <p>Multi-tenant SaaS platform scaffold for AI-assisted salon operations.</p>
          <div className="cta">
            <Link href="/auth/signup">Sign up your salon</Link>
            <Link href="/auth/login">Log in</Link>
          </div>
        </section>
      </main>
      <style jsx>{`
        .home {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4rem;
        }
        section {
          max-width: 720px;
          background: white;
          border-radius: 16px;
          padding: 3rem;
          box-shadow: 0 12px 40px rgba(15, 23, 42, 0.12);
        }
        h1 {
          margin-bottom: 1rem;
        }
        .cta {
          display: flex;
          gap: 1rem;
          margin-top: 2rem;
        }
        .cta :global(a) {
          padding: 0.75rem 1.5rem;
          background: #111827;
          color: white;
          border-radius: 999px;
        }
      `}</style>
    </>
  );
}
