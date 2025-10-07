import { useState } from 'react';
import Head from 'next/head';
import type { FeatureCode, PlanSummary } from '@ai-hairdresser/shared';
import { apiFetch } from '@/lib/api-client';
import { useFeatureFlags } from '@/lib/feature-flags';

export default function PlanAdminPage() {
  const { plan, availablePlans, loading, error, refresh } = useFeatureFlags();
  const [updating, setUpdating] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const currentCode = plan?.plan.code;
  const effectiveCode = plan?.effectivePlan.code;
  const effectiveName = plan?.effectivePlan.name;
  const downgraded = Boolean(plan && plan.downgradedTo && plan.downgradedTo.code !== plan.plan.code);

  async function handleSelect(target: PlanSummary) {
    setUpdating(target.code);
    setMessage(null);
    setSubmitError(null);
    try {
      await apiFetch('/tenants/plan', {
        method: 'POST',
        body: { planCode: target.code }
      });
      await refresh();
      setMessage(`Plan updated to ${target.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update plan';
      setSubmitError(message);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <>
      <Head>
        <title>Subscription &amp; billing | AI Hairdresser Receptionist</title>
      </Head>
      <main className="billing">
        <header>
          <div>
            <h1>Subscription &amp; billing</h1>
            {plan && (
              <p>
                Current plan: <strong>{plan.plan.name}</strong>
                {plan.isInGracePeriod && plan.gracePeriodEndsAt && (
                  <> (grace period ends {new Date(plan.gracePeriodEndsAt).toLocaleDateString()})</>
                )}
              </p>
            )}
            {downgraded && effectiveName && (
              <p className="warning">
                Your subscription reverted to {effectiveName}. Reactivate billing to regain premium features.
              </p>
            )}
          </div>
        </header>
        {error && <p className="error">Failed to load plan information.</p>}
        {message && <p className="success">{message}</p>}
        {submitError && <p className="error">{submitError}</p>}
        {loading && <p>Loading available plans…</p>}
        {!loading && (
          <section className="plans">
            {availablePlans.map((tier) => {
              const isCurrent = tier.code === currentCode;
              const isEffective = tier.code === effectiveCode;
              const disabled = updating !== null || isCurrent;
              const cta = isCurrent ? 'Current plan' : isEffective ? 'In use' : 'Select plan';
              return (
                <article key={tier.code} className={isEffective ? 'active' : ''}>
                  <header>
                    <h2>{tier.name}</h2>
                    <p className="price">
                      {tier.monthlyPrice ? `£${tier.monthlyPrice.toFixed(0)}/mo` : 'Free'}
                    </p>
                  </header>
                  {tier.description && <p className="description">{tier.description}</p>}
                  <ul>
                    {tier.features.map((feature) => (
                      <li key={feature}>{renderFeature(feature)}</li>
                    ))}
                    {!tier.features.length && <li>Core messaging &amp; calendar tools</li>}
                  </ul>
                  <button
                    disabled={disabled}
                    onClick={() => handleSelect(tier)}
                    aria-disabled={disabled}
                  >
                    {updating === tier.code ? 'Updating…' : cta}
                  </button>
                </article>
              );
            })}
          </section>
        )}
      </main>
      <style jsx>{`
        .billing {
          padding: 2rem 3rem;
        }
        header {
          margin-bottom: 2rem;
        }
        .plans {
          display: grid;
          gap: 1.5rem;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        article {
          border-radius: 16px;
          background: #ffffff;
          padding: 1.75rem;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        article.active {
          border: 2px solid #38bdf8;
        }
        article header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 1rem;
        }
        .price {
          font-size: 1.25rem;
          font-weight: 600;
        }
        ul {
          margin: 0;
          padding-left: 1.25rem;
          flex: 1;
        }
        button {
          align-self: flex-start;
          border-radius: 8px;
          border: none;
          background: #2563eb;
          color: #fff;
          padding: 0.5rem 1.5rem;
          cursor: pointer;
        }
        button[disabled],
        button[aria-disabled='true'] {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .error {
          color: #dc2626;
        }
        .success {
          color: #047857;
        }
        .warning {
          color: #d97706;
        }
      `}</style>
    </>
  );
}

const featureLabels: Record<FeatureCode, string> = {
  deposits_enabled: 'Deposits & secure online payments',
  ai_assistant_enabled: 'AI assistant for inbound messages',
  team_accounts: 'Team accounts & rota management'
};

function renderFeature(feature: FeatureCode) {
  return featureLabels[feature] ?? feature;
}
