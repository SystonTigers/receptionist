import { describe, expect, it } from 'vitest';

import { normalizeTwilio, safeLog } from '../messaging-service';

describe('messaging-service normalization', () => {
  it('normalizes whatsapp addressing', () => {
    const params = new URLSearchParams({
      From: 'whatsapp:+1555123',
      To: 'whatsapp:+1555987',
      Body: 'hi there',
      MessageSid: 'SM123'
    });

    const message = normalizeTwilio(params);
    expect(message.channel).toBe('whatsapp');
    expect(message.from).toBe('+1555123');
    expect(message.to).toBe('+1555987');
    expect(message.text).toBe('hi there');
  });

  it('masks sensitive fields in safeLog', () => {
    const params = new URLSearchParams({
      From: '+15551234567',
      To: '+15559876543',
      Body: 'ping',
      MessageSid: 'SM987654'
    });

    const message = normalizeTwilio(params);
    const log = safeLog(message);

    expect(log.from?.startsWith('+1')).toBe(true);
    expect(log.from?.includes('*')).toBe(true);
    expect(log.raw).toBeUndefined();
  });
});
