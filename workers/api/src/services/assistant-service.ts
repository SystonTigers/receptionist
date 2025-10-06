import { callOpenAI, type ChatMessage } from '../integrations/openai';

type BookingHistoryEntry =
  | string
  | {
      date?: string;
      service?: string;
      notes?: string;
    };

export type AssistRequestPayload = {
  message: string;
  context?: {
    clientName?: string;
    intent?: string;
    bookingHistory?: BookingHistoryEntry[];
    notes?: string;
    metadata?: Record<string, unknown>;
  };
};

export async function generateAssistantSuggestion(env: Env, tenantId: string, payload: AssistRequestPayload) {
  const { message, context } = payload;

  const history = (context?.bookingHistory ?? [])
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry.trim();
      }
      const parts = [entry.date, entry.service, entry.notes].filter(Boolean);
      return parts.join(' — ');
    })
    .filter((entry) => entry.length > 0);

  const contextSegments: string[] = [];

  if (context?.clientName) {
    contextSegments.push(`Client name: ${context.clientName}`);
  }

  if (context?.intent) {
    contextSegments.push(`Service intent: ${context.intent}`);
  }

  if (history.length) {
    contextSegments.push(`Recent bookings:\n- ${history.join('\n- ')}`);
  }

  if (context?.notes) {
    contextSegments.push(`Additional notes: ${context.notes}`);
  }

  const summary = contextSegments.length > 0 ? contextSegments.join('\n\n') : 'No extra context provided.';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a friendly salon receptionist. Provide concise, empathetic responses and suggest relevant services or next steps where helpful. Always keep the tone warm and professional.'
    },
    {
      role: 'user',
      content: `Tenant ID: ${tenantId}\nContext:\n${summary}\n\nClient message: ${message}`
    }
  ];

  const suggestion = await callOpenAI(env, {
    messages,
    temperature: 0.7,
    maxTokens: 260
  });

  return {
    suggestion
  };
}
