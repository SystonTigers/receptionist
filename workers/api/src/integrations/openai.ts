export async function callOpenAI(env: Env, options: { prompt: string }) {
  if (!env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY missing');
    return 'AI response placeholder.';
  }

  // TODO: Replace with fetch to OpenAI Chat Completions
  console.log('Call OpenAI with prompt', options.prompt);
  return 'Thanks for contacting the salon! How can we help you further?';
}
