import { checkUsageQuota, recordUsageEvent } from '../services/usage-service';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type CallOpenAIOptions = {
  prompt?: string;
  messages?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant supporting hair salon receptionists with friendly, professional responses.';

function estimatePromptTokens(options: CallOpenAIOptions) {
  if (options.messages && options.messages.length > 0) {
    return options.messages.reduce((sum, message) => sum + Math.ceil((message.content?.length ?? 0) / 4), 0);
  }
  return Math.ceil((options.prompt ?? '').length / 4);
}

export async function callOpenAI(env: Env, tenantId: string | null, options: CallOpenAIOptions) {
  if (!env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY missing');
    return 'AI response placeholder.';
  }

  const messages: ChatMessage[] = options.messages
    ? options.messages
    : [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: options.prompt ?? '' }
      ];

  if (!messages.length || messages.every((msg) => !msg.content.trim())) {
    throw new Error('No content provided for OpenAI request');
  }

  const estimatedTokens = Math.max(estimatePromptTokens(options) + (options.maxTokens ?? 320), 1);
  if (tenantId) {
    await checkUsageQuota(env, tenantId, 'ai.request', estimatedTokens);
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 320
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI chat completion failed', {
        status: response.status,
        error: errorText
      });
      return 'Sorry, I could not generate a response right now.';
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    const totalTokens =
      typeof payload.usage?.total_tokens === 'number' && Number.isFinite(payload.usage.total_tokens)
        ? payload.usage.total_tokens
        : estimatedTokens;

    if (tenantId) {
      await recordUsageEvent(env, tenantId, 'ai.request', {
        quantity: totalTokens,
        metadata: {
          model: 'gpt-4o-mini',
          tokens: totalTokens,
          totalTokens,
          promptTokens: payload.usage?.prompt_tokens ?? null,
          completionTokens: payload.usage?.completion_tokens ?? null
        }
      });
    }

    return content && content.length > 0
      ? content
      : 'Thanks for reaching out to the salon! How can we help you further?';
  } catch (error) {
    console.error('OpenAI request error', error);
    return 'Thanks for contacting the salon! We will be with you shortly.';
  }
}

export type { ChatMessage };
