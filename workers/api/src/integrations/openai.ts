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

export async function callOpenAI(env: Env, options: CallOpenAIOptions) {
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
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    return content && content.length > 0
      ? content
      : 'Thanks for reaching out to the salon! How can we help you further?';
  } catch (error) {
    console.error('OpenAI request error', error);
    return 'Thanks for contacting the salon! We will be with you shortly.';
  }
}

export type { ChatMessage };
