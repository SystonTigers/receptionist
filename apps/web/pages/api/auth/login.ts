import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.flatten() });
  }

  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-origin': 'next-web'
      },
      body: JSON.stringify(parseResult.data)
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: payload.error ?? 'Failed to login' });
    }

    const payload = await response.json();
    // TODO: issue secure cookie or Supabase session using payload tokens
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Login error', error);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
