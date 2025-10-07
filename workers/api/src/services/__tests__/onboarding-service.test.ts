import { describe, it, expect } from 'vitest';
import { evaluateOnboardingSteps } from '../onboarding-service';

describe('evaluateOnboardingSteps', () => {
  it('marks all steps incomplete when nothing configured', () => {
    const result = evaluateOnboardingSteps(null, 0, null);
    expect(result.brandingComplete).toBe(false);
    expect(result.servicesComplete).toBe(false);
    expect(result.firstBookingComplete).toBe(false);
  });

  it('detects branding completion when logo or primary colour present', () => {
    const result = evaluateOnboardingSteps({ branding: { primaryColor: '#ff00ff' } }, 0, null);
    expect(result.brandingComplete).toBe(true);
  });

  it('requires at least one service for servicesComplete', () => {
    const result = evaluateOnboardingSteps({ branding: {} }, 2, null);
    expect(result.servicesComplete).toBe(true);
  });

  it('flags first booking when appointment is present', () => {
    const result = evaluateOnboardingSteps({}, 0, { start_time: '2024-01-01T10:00:00Z' });
    expect(result.firstBookingComplete).toBe(true);
    expect(result.firstBookingAt).toBe('2024-01-01T10:00:00Z');
  });
});
